const express = require("express");
const fs = require("fs-extra");
const path = require("path");

const router = express.Router();

const TEMP_DIR = path.resolve("uploads", "temp");
const UPLOADS_DIR = path.resolve("uploads");

fs.ensureDir(TEMP_DIR);
fs.ensureDir(UPLOADS_DIR);

router.post("/video/upload/:filename", async function (req, res, next) {
	const { filename } = req.params;
	let { chunkFilename, start = 0 } = req.query;

	start = isNaN(Number(start)) ? 0 : Number(start);
	const chunkDir = path.resolve(TEMP_DIR, filename);
	await fs.ensureDir(chunkDir);
	const chunkPath = path.resolve(chunkDir, chunkFilename);
	const stream = fs.createWriteStream(chunkPath, {
		flags: "a",
		start,
	});

	req.on("aborted", () => {
		stream.close();
	});

	await pipeStream(req, stream);
	res.json({ success: true });
});

function pipeStream(rs, ws) {
	return new Promise((resolve, reject) => {
		rs.pipe(ws).on("finish", resolve).on("error", reject);
	});
}

router.get("/video/merge/:filename", async function (req, res, next) {
	const { filename } = req.params;
	const chunkDir = path.resolve(TEMP_DIR, filename);
	const chunkFiles = await fs.readdir(chunkDir);

	if (chunkFiles.length === 0) {
		return res.json({ success: false, message: "No chunks found" });
	}

	// 按照切片的索引进行排序
	chunkFiles.sort((a, b) => a.split("-")[0] - b.split("-")[0]);
	const uploadsPath = path.resolve(UPLOADS_DIR, filename);

	// 创建可写流
	const ws = fs.createWriteStream(uploadsPath);

	// 计算总大小
	let totalSize = 0;
	const chunkPaths = [];
	for (const chunkFilename of chunkFiles) {
		const chunkPath = path.resolve(chunkDir, chunkFilename);
		const stats = await fs.stat(chunkPath);
		totalSize += stats.size;
		chunkPaths.push(chunkPath);
	}

	// 设置响应头为事件流
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	let mergedSize = 0;

	// 合并文件
	for (const chunkPath of chunkPaths) {
		const rs = fs.createReadStream(chunkPath);

		await new Promise((resolve, reject) => {
			rs.on("data", (chunk) => {
				mergedSize += chunk.length;
				const progress = Math.round((mergedSize / totalSize) * 100);
				// 发送进度事件
				res.write(`data: ${JSON.stringify({ progress })}\n\n`);
			});

			rs.on("end", resolve);
			rs.on("error", reject);

			rs.pipe(ws, { end: false });
		});
	}

	ws.end();

	// 合并完成后，删除切片文件夹
	await fs.rm(chunkDir, { recursive: true, force: true });

	// 发送完成事件
	res.write(`data: ${JSON.stringify({ progress: 100, completed: true })}\n\n`);
	res.end();
});

router.get("/video/verify/:filename", async (req, res) => {
	// 获取文件名
	const { filename } = req.params;
	// 拼接文件路径
	const filePath = path.resolve(UPLOADS_DIR, filename);

	// 判断文件是否存在
	const isExist = await fs.pathExists(filePath);

	if (isExist) {
		res.json({ success: true, needUpload: false });
	} else {
		// 拼接切片文件夹路径
		const chunkDir = path.resolve(TEMP_DIR, filename);
		// 判断切片文件夹是否存在
		const hasChunks = await fs.pathExists(chunkDir);
		let uploadedChunks = [];
		if (hasChunks) {
			// 读取切片文件夹中的文件名
			const chunkFilenames = await fs.readdir(chunkDir);
			// 获取切片文件的大小
			uploadedChunks = await Promise.all(
				chunkFilenames.map(async (chunkFilename) => {
					const { size } = await fs.stat(path.resolve(chunkDir, chunkFilename));
					return { chunkFilename, size };
				})
			);
			res.json({ success: true, needUpload: true, uploadedChunks });
		} else {
			res.json({ success: true, needUpload: true, uploadedChunks });
		}
	}
});

module.exports = router;
