// utils/transcodeWorker.js
const { parentPort, workerData } = require("worker_threads");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

const videoPath = workerData.videoPath;
const outputDir = path.join(
	path.dirname(videoPath),
	"transcoded",
	path.basename(videoPath, path.extname(videoPath))
);

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, { recursive: true });
}

// 获取视频信息
const getVideoInfo = (inputPath) => {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(inputPath, (err, metadata) => {
			if (err) {
				reject(err);
			} else {
				const videoStream = metadata.streams.find(
					(s) => s.codec_type === "video"
				);
				const audioStream = metadata.streams.find(
					(s) => s.codec_type === "audio"
				);

				const info = {
					codec: videoStream.codec_name,
					width: videoStream.width,
					height: videoStream.height,
					fps: eval(videoStream.r_frame_rate),
					duration: metadata.format.duration,
					audioCodec: audioStream ? audioStream.codec_name : null,
					bitrate: metadata.format.bit_rate
						? parseInt(metadata.format.bit_rate)
						: null,
					audioBitrate: audioStream ? parseInt(audioStream.bit_rate || 0) : 0,
				};

				resolve(info);
			}
		});
	});
};

// 生成转码参数
const generateTranscodingParams = (
	originalWidth,
	originalHeight,
	originalFps
) => {
	const params = [];
	const resolutions = [];

	if (originalWidth >= 3840 || originalHeight >= 2160) {
		resolutions.push({ width: 3840, height: 2160 });
		resolutions.push({ width: 1920, height: 1080 });
		resolutions.push({ width: 1280, height: 720 });
		resolutions.push({ width: 854, height: 480 });
		resolutions.push({ width: 640, height: 360 });
	} else if (originalWidth >= 1920 || originalHeight >= 1080) {
		resolutions.push({ width: 1920, height: 1080 });
		resolutions.push({ width: 1280, height: 720 });
		resolutions.push({ width: 854, height: 480 });
		resolutions.push({ width: 640, height: 360 });
	} else if (originalWidth >= 1280 || originalHeight >= 720) {
		resolutions.push({ width: 1280, height: 720 });
		resolutions.push({ width: 854, height: 480 });
		resolutions.push({ width: 640, height: 360 });
	} else {
		resolutions.push({ width: originalWidth, height: originalHeight });
		if (originalWidth > 854 || originalHeight > 480) {
			resolutions.push({ width: 854, height: 480 });
		}
		resolutions.push({ width: 640, height: 360 });
	}

	for (const res of resolutions) {
		if (originalFps >= 60) {
			params.push({ ...res, fps: 60 });
			params.push({ ...res, fps: 30 });
		} else {
			params.push({ ...res, fps: originalFps >= 30 ? 30 : originalFps });
		}
	}

	return params;
};

// 获取硬件加速参数
const getHardwareAccelParams = async (codec) => {
	const params = {
		decoder: codec === "av1" ? "libdav1d" : "hevc" ? "hevc" : "h264",
		encoder: codec === "av1" ? "libsvtav1" : "hevc" ? "libx265" : "libx264",
	};

	try {
		const hasNvidia =
			process.env.PATH.includes("NVIDIA") ||
			(process.platform === "win32" &&
				fs.existsSync("C:\\Program Files\\NVIDIA Corporation"));

		if (hasNvidia) {
			if (codec === "h264") {
				params.encoder = "h264_nvenc";
				params.decoder = "h264_cuvid";
			} else if (codec === "hevc") {
				params.encoder = "hevc_nvenc";
				params.decoder = "hevc_cuvid";
			} else if (codec === "av1") {
				params.encoder = "av1_nvenc";
				params.decoder = "av1_cuvid";
			}
		}
	} catch (e) {
		console.warn(
			"Hardware acceleration detection failed, using software encoding"
		);
	}

	return params;
};

const getEncoderQualityParams = (codecType, width, height, videoInfo) => {
	// 计算最大比特率和缓冲区大小
	const { maxrate, bufsize } = calculateMaxBitrate(
		videoInfo.bitrate,
		videoInfo.width,
		videoInfo.height,
		width,
		height,
		codecType
	);

	return {
		maxrate,
		bufsize,
		preset: "slow",
	};
};

// 计算最大比特率
const calculateMaxBitrate = (
	originalBitrate,
	originalWidth,
	originalHeight,
	targetWidth,
	targetHeight,
	codecType
) => {
	// 如果没有原始比特率，使用基于分辨率的默认值
	if (!originalBitrate || originalBitrate <= 0) {
		const pixels = targetWidth * targetHeight;
		if (pixels >= 3840 * 2160) return { maxrate: "12M", bufsize: "24M" };
		if (pixels >= 1920 * 1080) return { maxrate: "6M", bufsize: "12M" };
		if (pixels >= 1280 * 720) return { maxrate: "3M", bufsize: "6M" };
		if (pixels >= 854 * 480) return { maxrate: "1.5M", bufsize: "3M" };
		return { maxrate: "750K", bufsize: "1.5M" };
	}

	// 计算基于原始比特率和分辨率比例的比特率
	const originalPixels = originalWidth * originalHeight;
	const targetPixels = targetWidth * targetHeight;
	const resolutionRatio = targetPixels / originalPixels;

	let bitrate = originalBitrate * resolutionRatio;

	// 应用编码器效率因子
	const codecFactor =
		{
			h264: 1.0,
			hevc: 0.7,
			av1: 0.6,
		}[codecType] || 1.0;

	bitrate *= codecFactor;

	// 设置合理的范围限制
	const minBitrate = 200 * 1000; // 200Kbps
	const maxBitrate = 50 * 1000 * 1000; // 50Mbps
	bitrate = Math.max(minBitrate, Math.min(maxBitrate, bitrate));

	// 计算最大比特率和缓冲区大小
	const maxrate = bitrate * 1.5; // 最大比特率是平均比特率的1.5倍
	const bufsize = maxrate * 2; // 缓冲区大小是最大比特率的2倍

	// 格式化输出
	const formatBitrate = (value) => {
		if (value >= 1000 * 1000) {
			return `${Math.round(value / (1000 * 1000))}M`;
		} else {
			return `${Math.round(value / 1000)}K`;
		}
	};

	return {
		maxrate: formatBitrate(maxrate),
		bufsize: formatBitrate(bufsize),
	};
};

const getProfileAndLevel = (codecType, width, height, fps) => {
	// 计算帧大小等级 (基于ITU-T标准)
	const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
	const macroblocksPerSec = macroblocks * fps;

	// 动态确定level
	let level;

	// 动态确定profile
	let profile;
	if (codecType === "h264") {
		profile = width >= 1920 ? "high" : "main";
	} else if (codecType === "hevc") {
		profile = width >= 3840 ? "main10" : "main";
	} else {
		// AV1
		profile = "main";
	}

	if (macroblocksPerSec <= 3600) level = "3.0"; // SD
	else if (macroblocksPerSec <= 12000) level = "3.1"; // 720p
	else if (macroblocksPerSec <= 24000) level = "4.0"; // 1080p
	else if (macroblocksPerSec <= 48000) level = "4.1"; // 1080p60
	else if (macroblocksPerSec <= 120000) level = "5.1"; // 4K30
	else if (macroblocksPerSec <= 240000) level = "5.2"; // 4K60
	else level = "6.2"; // 8K

	return { profile, level };
};

// 写入配置文件
const writeConfig = (dirPath, value) => {
	try {
		const configPath = path.join(dirPath, "config.json");

		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}

		fs.writeFileSync(
			configPath,
			JSON.stringify(value !== undefined ? value : false, null, 2),
			"utf8"
		);
		return true;
	} catch (error) {
		console.error("写入config.json失败:", error);
		return false;
	}
};

// 执行转码
const transcodeToDash = async (
	videoPath,
	outputDir,
	transcodingParams,
	videoInfo
) => {
	try {
		const hardware = await getHardwareAccelParams(videoInfo.codec);

		const codecDirs = {
			h264: path.join(outputDir, "h264"),
			hevc: path.join(outputDir, "hevc"),
			av1: path.join(outputDir, "av1"),
		};

		// 确保输出目录存在
		Object.values(codecDirs).forEach((dir) => {
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		});

		for (const [codecType, codecDir] of Object.entries(codecDirs)) {
			if (!fs.existsSync(path.join(codecDir, "config.json"))) {
				const encoder = await getHardwareAccelParams(codecType);
				let ffmpegCmd = `ffmpeg -threads 2 -c:v ${
					hardware.decoder
				} -i ${videoPath.replace(/\\/g, "/")} `;

				// 为每个转码参数添加视频流映射
				transcodingParams.forEach((param, index) => {
					ffmpegCmd += `-map 0:v:0 `;
				});

				// 音频处理
				const hasAudio = videoInfo.audioCodec && videoInfo.audioBitrate > 0;
				if (hasAudio) {
					ffmpegCmd += `-map 0:a:0 `;
				}

				// 存储每个轨道的编码参数（用于后续修改MPD）
				const trackParams = [];

				// 为每个转码参数添加编码设置
				transcodingParams.forEach((param, index) => {
					const width = param.width % 2 === 0 ? param.width : param.width - 1;
					const height =
						param.height % 2 === 0 ? param.height : param.height - 1;

					const qualityParams = getEncoderQualityParams(
						codecType,
						width,
						height,
						videoInfo
					);
					const { profile, level } = getProfileAndLevel(
						codecType,
						width,
						height,
						param.fps
					);

					// 保存轨道参数（用于修改MPD）
					trackParams.push({ width, height, fps: param.fps, profile, level });

					ffmpegCmd += `-c:v:${index} ${encoder.encoder} `;

					if (!codecType === "av1") {
						ffmpegCmd += `-profile:v:${index} ${profile} `;
					}

					ffmpegCmd += `-level:v:${index} ${level} `;
					ffmpegCmd += `-maxrate:v:${index} ${qualityParams.maxrate} `;
					ffmpegCmd += `-bufsize:v:${index} ${qualityParams.bufsize} `;
					ffmpegCmd += `-s:v:${index} ${width}x${height} `;
					ffmpegCmd += `-r:v:${index} ${param.fps} `;
					ffmpegCmd += `-preset ${qualityParams.preset} `;
				});

				// 音频编码
				if (hasAudio) {
					ffmpegCmd += `-c:a aac -b:a 320k `;
				}

				// DASH 输出参数
				const outputPath = path.join(codecDir, "index.mpd");
				ffmpegCmd += `-f dash `;
				ffmpegCmd += `-streaming 1 `;
				ffmpegCmd += `-seg_duration 5 `;
				ffmpegCmd += `-init_seg_name init-\\$RepresentationID\\$.m4s `;
				ffmpegCmd += `-media_seg_name chunk-\\$RepresentationID\\$-\\$Number%03d\\$.m4s `;
				ffmpegCmd += `-adaptation_sets ${
					hasAudio ? '"id=0,streams=v id=1,streams=a"' : '"id=0,streams=v"'
				} `;
				ffmpegCmd += outputPath.replace(/\\/g, "/");

				// console.log("Executing FFmpeg command:", ffmpegCmd);

				try {
					execSync(ffmpegCmd, { stdio: "inherit", shell: "bash" });

					// HEVC 特殊处理：修改 MPD 文件中的 codecs 参数
					if (codecType === "hevc") {
						const mpdContent = fs.readFileSync(outputPath, "utf8");

						// 生成替换映射表（RepresentationID -> 正确的codecs）
						const replacements = {};
						const representationRegex =
							/<Representation[^>]*id="([^"]+)"[^>]*codecs="([^"]+)"/g;

						let match;
						let repIndex = 0;
						while ((match = representationRegex.exec(mpdContent)) !== null) {
							const [fullMatch, repId, currentCodec] = match;
							if (repIndex < trackParams.length) {
								const { profile, level } = trackParams[repIndex];

								// 计算正确的 HEVC codecs 参数
								const profileSpace = profile === "main10" ? 2 : 1;
								const tierFlag = profile === "main10" ? 4 : 2;
								const levelId = parseInt(level.replace(".", "")) * 3;
								const constraintFlags = 0x90;
								const hevcCodecs = `hev1.${profileSpace}.${tierFlag}.L${levelId}.${constraintFlags.toString(
									16
								)}`;

								replacements[repId] = hevcCodecs;
								repIndex++;
							}
						}

						// 执行替换
						let modifiedMpd = mpdContent;
						for (const [repId, codecs] of Object.entries(replacements)) {
							modifiedMpd = modifiedMpd.replace(
								new RegExp(
									`(<Representation[^>]*id="${repId}"[^>]*)codecs="[^"]*"`
								),
								`$1codecs="${codecs}"`
							);
						}

						fs.writeFileSync(outputPath, modifiedMpd, "utf8");
					}

					writeConfig(codecDir, true);
					parentPort.postMessage({
						type: "progress",
						codec: codecType,
						status: "completed",
					});
				} catch (err) {
					console.error(`Error processing ${codecType} version:`, err);
					throw err;
				}
			} else {
				parentPort.postMessage({
					type: "progress",
					codec: codecType,
					status: "already_completed",
				});
			}
		}
	} catch (err) {
		console.error("Fatal error in transcodeToDash:", err);
		throw err;
	}
};

// 主执行函数
(async () => {
	try {
		const videoInfo = await getVideoInfo(videoPath);
		const transcodingParams = generateTranscodingParams(
			videoInfo.width,
			videoInfo.height,
			videoInfo.fps
		);

		await transcodeToDash(videoPath, outputDir, transcodingParams, videoInfo);

		parentPort.postMessage({ type: "complete" });
	} catch (err) {
		parentPort.postMessage({
			type: "error",
			error: err.message,
			stack: err.stack,
		});
		process.exit(1);
	}
})();
