// utils/transcodeQueue.js
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");
const { Worker } = require("worker_threads");
const Video = require("../models/Video");

class TranscodeQueue extends EventEmitter {
	constructor() {
		super();
		this.queue = [];
		this.isProcessing = false;
		this.worker = null;
		this.maxRetries = 3;
		this.retryCounts = new Map(); // 记录每个视频的重试次数
		this.init();
	}

	async init() {
		// 检查是否有未完成的转码任务
		await this.checkForPendingTranscodes();
	}

	async checkForPendingTranscodes() {
		const uploadsDir = path.join(__dirname, "../uploads");
		const outputDir = path.join(__dirname, "../uploads/transcoded");

		try {
			if (!fs.existsSync(uploadsDir)) return;

			const files = fs.readdirSync(uploadsDir);
			const videoFiles = files.filter((file) => {
				const ext = path.extname(file).toLowerCase();
				return [".mp4", ".avi", ".mov", ".mkv", ".webm"].includes(ext);
			});

			for (const video of videoFiles) {
				const videoName = path.basename(video, path.extname(video));
				const transcodedDir = path.join(outputDir, videoName);
				const coverName = videoName + "_cover.png";
				const coverPath = path.join(
					"uploads",
					"transcoded",
					videoName,
					coverName
				);

				await Video.findOneAndUpdate(
					{ cover: coverPath },
					{ $set: { status: "processing" } }
				);

				// 检查是否已经存在转码目录
				if (!fs.existsSync(transcodedDir)) {
					this.addToQueue(path.join(uploadsDir, video));
				} else {
					// 检查转码是否完成
					const isComplete = await this.checkTranscodeCompletion(transcodedDir);

					if (!isComplete) {
						this.addToQueue(path.join(uploadsDir, video));
					} else {
						await Video.findOneAndUpdate(
							{ cover: coverPath },
							{ $set: { status: "normal" } }
						);
					}
				}
			}
		} catch (err) {
			console.error("Error checking for pending transcodes:", err);
		}
	}

	async checkTranscodeCompletion(transcodedDir) {
		try {
			const codecDirs = ["h264", "hevc", "av1"].map((codec) =>
				path.join(transcodedDir, codec)
			);

			for (const codecDir of codecDirs) {
				if (!fs.existsSync(codecDir)) return false;

				const configPath = path.join(codecDir, "config.json");
				if (!fs.existsSync(configPath)) return false;

				const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
				if (!config) return false;
			}

			return true;
		} catch (err) {
			console.error("Error checking transcode completion:", err);
			return false;
		}
	}

	addToQueue(videoPath) {
		const videoName = path.basename(videoPath);
		const existingIndex = this.queue.findIndex(
			(item) => path.basename(item) === videoName
		);

		if (existingIndex === -1) {
			this.queue.push(videoPath);
			console.log(`Added ${videoName} to transcode queue`);
			this.processQueue();
		}
	}

	async processQueue() {
		if (this.isProcessing || this.queue.length === 0) return;

		this.isProcessing = true;
		const videoPath = this.queue.shift();
		const videoName = path.basename(videoPath);

		try {
			console.log(`Starting transcode for ${videoName}`);

			// 使用Worker处理转码
			this.worker = new Worker(path.join(__dirname, "transcodeWorker.js"), {
				workerData: { videoPath },
				resourceLimits: {
					maxOldGenerationSizeMb: 1024,
					maxYoungGenerationSizeMb: 256,
				},
			});

			this.worker.on("message", (message) => {
				console.log(`Worker message for ${videoName}:`, message);
			});

			this.worker.on("error", (err) => {
				console.error(`Worker error for ${videoName}:`, err);
				this.handleTranscodeFailure(videoPath);
			});

			this.worker.on("exit", (code) => {
				if (code !== 0) {
					console.error(
						`Worker stopped with exit code ${code} for ${videoName}`
					);
					this.handleTranscodeFailure(videoPath);
				} else {
					console.log(`Successfully transcoded ${videoName}`);
					this.retryCounts.delete(videoPath);
					this.emit("transcodeComplete", videoPath);
				}
				this.isProcessing = false;
				this.processQueue();
			});
		} catch (err) {
			console.error(`Error processing ${videoName}:`, err);
			this.handleTranscodeFailure(videoPath);
			this.isProcessing = false;
			this.processQueue();
		}
	}

	handleTranscodeFailure(videoPath) {
		const currentRetry = (this.retryCounts.get(videoPath) || 0) + 1;

		if (currentRetry <= this.maxRetries) {
			this.retryCounts.set(videoPath, currentRetry);
			console.log(
				`Retrying ${path.basename(videoPath)} (attempt ${currentRetry}/${
					this.maxRetries
				})`
			);
			this.queue.unshift(videoPath);
		} else {
			console.error(`Max retries exceeded for ${path.basename(videoPath)}`);
			this.retryCounts.delete(videoPath);
			this.emit("transcodeFailed", videoPath);
		}
	}
}

// 导出单例实例
module.exports = new TranscodeQueue();
