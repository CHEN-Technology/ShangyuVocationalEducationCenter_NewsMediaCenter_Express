const fs = require("fs-extra");
const path = require("path");
const Video = require("../models/Video");
const { getFileHash } = require("../utils/hashUtils");
const { getUploadDir, getTempDir } = require("../utils/fileUtils");

exports.initUpload = async ({
	title,
	description,
	category,
	fileHash,
	fileName,
	fileSize,
}) => {
	// 检查是否已存在相同文件
	const existingFile = await Video.findOne({ fileHash });
	if (existingFile) {
		return {
			success: false,
			message: "文件已存在",
			data: {
				exists: true,
				video: existingFile,
			},
		};
	}

	// 创建临时目录
	const tempDir = getTempDir(fileHash);
	await fs.ensureDir(tempDir);

	return {
		success: true,
		message: "上传初始化成功",
		data: { exists: false },
	};
};

exports.saveChunk = async ({ fileHash, chunkIndex, totalChunks, file }) => {
	// 检查分片是否已存在（断点续传）
	const chunkPath = path.join(getTempDir(fileHash), chunkIndex);
	if (await fs.pathExists(chunkPath)) {
		return { success: true, message: "分片已存在", data: { chunkIndex } };
	}

	// 保存分片
	await fs.move(file.path, chunkPath);

	return {
		success: true,
		message: "分片上传成功",
		data: {
			chunkIndex,
			uploadedChunks: await getUploadedChunks(fileHash, totalChunks),
		},
	};
};

exports.mergeChunks = async ({
	fileHash,
	fileName,
	fileSize,
	title,
	description,
	category,
}) => {
	const tempDir = getTempDir(fileHash);
	const uploadDir = getUploadDir();
	const filePath = path.join(uploadDir, fileName);

	// 合并分片
	const chunks = await fs.readdir(tempDir);
	chunks.sort((a, b) => parseInt(a) - parseInt(b));

	await Promise.all(
		chunks.map((chunk, index) =>
			fs.appendFile(filePath, fs.readFileSync(path.join(tempDir, chunk)))
		)
	);

	// 清理临时文件
	await fs.remove(tempDir);

	// 保存到数据库
	const video = new Video({
		title,
		description,
		category,
		fileName,
		filePath,
		fileSize,
		fileHash,
		uploadDate: new Date(),
	});

	await video.save();

	return {
		success: true,
		message: "文件上传完成",
		data: { video },
	};
};

exports.verifyFile = async (fileHash) => {
	const existingFile = await Video.findOne({ fileHash });
	return {
		success: true,
		data: {
			exists: !!existingFile,
			video: existingFile,
		},
	};
};

async function getUploadedChunks(fileHash, totalChunks) {
	const tempDir = getTempDir(fileHash);
	const chunks = await fs.readdir(tempDir);
	return Array.from({ length: totalChunks }, (_, i) => i).map((i) =>
		chunks.includes(i.toString())
	);
}
