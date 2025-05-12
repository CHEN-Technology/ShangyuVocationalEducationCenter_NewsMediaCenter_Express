const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const inputDir = path.join(__dirname, "../uploads");
const outputDir = path.join(__dirname, "../uploads/transcoded");

if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, { recursive: true });
}

// 获取视频文件列表
const getVideos = () => {
	const files = fs.readdirSync(inputDir);
	const videos = files.filter((file) => {
		const ext = path.extname(file).toLowerCase();
		return [".mp4", ".avi", ".mov", ".mkv", ".webm"].includes(ext);
	});
	return videos;
};

// 获取视频元数据
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
					fps: eval(videoStream.r_frame_rate), // 计算帧率
					duration: metadata.format.duration,
					audioCodec: audioStream ? audioStream.codec_name : null,
					bitrate: metadata.format.bit_rate
						? parseInt(metadata.format.bit_rate)
						: null,
					audioBitrate: audioStream ? parseInt(audioStream.bit_rate || 0) : 0, // 新增音频码率字段
				};

				resolve(info);
			}
		});
	});
};

// 根据原始分辨率生成转码参数
const generateTranscodingParams = (
	originalWidth,
	originalHeight,
	originalFps
) => {
	const params = [];
	const resolutions = [];

	// 根据原始分辨率确定需要转码的分辨率
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

	// 为每个分辨率生成帧率选项
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

// 根据编码器选择硬件加速参数
const getHardwareAccelParams = async (codec) => {
	// 默认使用软件编码
	const params = {
		decoder: codec === "av1" ? "libsvtav1" : "hevc" ? "libx265" : "libx264",
		encoder: codec === "av1" ? "libdav1d" : "hevc" ? "hevc" : "h264",
	};

	try {
		// 简化硬件检测
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

// 计算比特率
const calculateBitrate = (
	originalBitrate,
	originalWidth,
	originalHeight,
	targetWidth,
	targetHeight,
	codecType
) => {
	if (!originalBitrate || originalBitrate <= 0) {
		// 如果没有原始比特率信息，使用保守的默认值
		const pixels = targetWidth * targetHeight;
		if (pixels >= 3840 * 2160) return "12M"; // 4K
		if (pixels >= 1920 * 1080) return "4M"; // 1080p
		if (pixels >= 1280 * 720) return "2M"; // 720p
		if (pixels >= 854 * 480) return "1M"; // 480p
		return "500K"; // 360p
	}

	// 计算分辨率比例
	const originalPixels = originalWidth * originalHeight;
	const targetPixels = targetWidth * targetHeight;
	const resolutionRatio = targetPixels / originalPixels;

	// 计算基础比特率（按分辨率比例调整）
	let bitrate = originalBitrate * resolutionRatio;

	// 根据编码格式调整（不同编码格式的效率差异）
	const codecFactor =
		{
			h264: 1.0, // H.264作为基准
			hevc: 0.7, // HEVC效率比H.264高约30%
			av1: 0.6, // AV1效率比H.264高约40%
		}[codecType] || 1.0;

	bitrate *= codecFactor;

	// 确保比特率在合理范围内
	const minBitrate = 200 * 1000; // 200kbps最低
	const maxBitrate = 50 * 1000 * 1000; // 50Mbps最高
	bitrate = Math.max(minBitrate, Math.min(maxBitrate, bitrate));

	// 转换为合适的单位
	if (bitrate >= 1000 * 1000) {
		return `${Math.round(bitrate / (1000 * 1000))}M`;
	} else {
		return `${Math.round(bitrate / 1000)}K`;
	}
};

// 完成 transcodeToDash 函数
const transcodeToDash = async (
	inputPath,
	outputDir,
	transcodingParams,
	videoInfo,
	video
) => {
	try {
		const hardware = await getHardwareAccelParams(videoInfo.codec);

		const codecDirs = {
			h264: path.join(outputDir, "h264"),
			hevc: path.join(outputDir, "hevc"),
			av1: path.join(outputDir, "av1"),
		};

		Object.values(codecDirs).forEach((dir) => {
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		});

		for (const [codecType, codecDir] of Object.entries(codecDirs)) {
			// console.log(codecDir);
			await writeConfig(codecDir);
			const res = await readConfig(codecDir);
			if (!res) {
				const encoder = await getHardwareAccelParams(codecType);
				let ffmpegCmd = `ffmpeg -threads 2 -c:v ${
					hardware.decoder
				} -i ${inputPath.replace(/\\/g, "/")} `;

				// 先添加所有-map选项
				transcodingParams.forEach((param, index) => {
					ffmpegCmd += `-map 0:v:0 `;
				});

				// 如果有音频，添加音频映射
				const hasAudio = videoInfo.audioCodec && videoInfo.audioBitrate > 0;
				if (hasAudio) {
					ffmpegCmd += `-map 0:a:0 `;
				}

				// 然后添加视频编码参数
				transcodingParams.forEach((param, index) => {
					const width = param.width % 2 === 0 ? param.width : param.width - 1;
					const height =
						param.height % 2 === 0 ? param.height : param.height - 1;
					const bitrate = calculateBitrate(
						videoInfo.bitrate,
						videoInfo.width,
						videoInfo.height,
						width,
						height,
						codecType
					);

					ffmpegCmd += `-c:v:${index} ${encoder.encoder} `;
					ffmpegCmd += `-b:v:${index} ${bitrate} `;
					ffmpegCmd += `-s:v:${index} ${width}x${height} `;
					ffmpegCmd += `-r:v:${index} ${param.fps} `;
					ffmpegCmd += `-preset slow `;
				});

				// 添加音频编码参数
				if (hasAudio) {
					ffmpegCmd += `-c:a aac -b:a 320k `;
				}

				const outputPath = path.join(codecDir, "index.mpd");
				ffmpegCmd += `-f dash `;
				ffmpegCmd += `-seg_duration 5 `;
				ffmpegCmd += `-init_seg_name init-\\$RepresentationID\\$.m4s `;
				ffmpegCmd += `-media_seg_name chunk-\\$RepresentationID\\$-\\$Number%03d\\$.m4s `;
				ffmpegCmd += `-adaptation_sets ${
					hasAudio ? '"id=0,streams=v id=1,streams=a"' : '"id=0,streams=v"'
				} `;
				ffmpegCmd += outputPath.replace(/\\/g, "/");
				console.log(ffmpegCmd);

				try {
					execSync(ffmpegCmd, { stdio: "inherit", shell: "bash" });
					writeConfig(codecDir, true);
					console.log(`Transcoding ${video} to ${codecType} version completed`);
				} catch (err) {
					console.error(
						`Error processing ${videoInfo.codec.name} version:`,
						err
					);
				}
			} else {
				console.log(`${video} to ${codecType} version is Ready`);
			}
		}
	} catch (err) {
		console.error("Fatal error in transcodeToDash:", err);
		throw err;
	}
};

/**
 * 读取指定目录下的config.json文件中的值
 * @param {string} dirPath - 本地目录路径
 * @returns {Promise<any>} - 返回解析后的JSON内容，不存在则返回false
 */
async function readConfig(dirPath) {
	try {
		const configPath = path.join(dirPath, "config.json");
		await fs.promises.access(configPath);
		const data = await fs.promises.readFile(configPath, "utf8");
		return JSON.parse(data);
	} catch (error) {
		if (error.code === "ENOENT") {
			return false; // 文件不存在返回false
		}
		console.error("读取config.json失败:", error);
		return false;
	}
}

/**
 * 写入config.json文件（符合要求的逻辑）
 * @param {string} dirPath - 本地目录路径
 * @param {any} [value] - 可选的要写入的值
 * @returns {Promise<boolean>} - 是否执行了写入操作
 */
async function writeConfig(dirPath, value) {
	try {
		const configPath = path.join(dirPath, "config.json");

		// 检查文件是否存在
		let fileExists = true;
		try {
			await fs.promises.access(configPath);
		} catch (error) {
			if (error.code === "ENOENT") {
				fileExists = false;
			} else {
				throw error;
			}
		}

		// 文件不存在：写入默认值false
		if (!fileExists) {
			await fs.promises.mkdir(dirPath, { recursive: true });
			await fs.promises.writeFile(
				configPath,
				JSON.stringify(false, null, 2),
				"utf8"
			);
			return true;
		}

		// 文件存在且传了value：写入value
		if (arguments.length > 1) {
			// 检测是否传了value参数
			await fs.promises.writeFile(
				configPath,
				JSON.stringify(value, null, 2),
				"utf8"
			);
			return true;
		}

		// 文件存在但没传value：不操作
		return false;
	} catch (error) {
		console.error("操作config.json失败:", error);
		return false;
	}
}

// 修改后的 main 函数
const main = async function () {
	try {
		const videos = getVideos();

		for (const video of videos) {
			const ext = path.extname(video);
			const videoWithoutExt = path.basename(video, ext);
			const currentOutputDir = path.join(outputDir, videoWithoutExt);

			if (!fs.existsSync(currentOutputDir)) {
				fs.mkdirSync(currentOutputDir, { recursive: true });
			}

			const inputPath = path.join(inputDir, video);

			try {
				console.log(`Processing ${video}...`);

				if (!fs.existsSync(inputPath)) {
					throw new Error(`Input file not found: ${inputPath}`);
				}

				// 获取视频信息
				const videoInfo = await getVideoInfo(inputPath);
				console.log("Video info:", videoInfo);

				// 生成转码参数
				const transcodingParams = generateTranscodingParams(
					videoInfo.width,
					videoInfo.height,
					videoInfo.fps
				);
				console.log("Transcoding params:", transcodingParams);

				// 执行完整转码
				await transcodeToDash(
					inputPath,
					currentOutputDir,
					transcodingParams,
					videoInfo,
					video
				);

				console.log(`Successfully processed ${video}`);
			} catch (err) {
				console.error(`Error processing ${video}:`, err.message);
				const errorLogPath = path.join(currentOutputDir, "error.log");
				fs.writeFileSync(
					errorLogPath,
					`Error processing ${video}:\n${err.stack}\n\n${err.message}`
				);
			}
		}
	} catch (err) {
		console.error("Fatal error in main:", err);
	}
};

// 启动主函数
main();
