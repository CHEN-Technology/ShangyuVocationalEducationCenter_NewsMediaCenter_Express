const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const multer = require("multer");
const VideoCate = require("../models/VideoCate");
const Video = require("../models/Video");
const transcodeQueue = require("../utils/transcodeQueue");

const router = express.Router();

const TEMP_DIR = path.resolve("uploads", "temp");
const COVERS_DIR = path.resolve(TEMP_DIR, "covers");
const UPLOADS_DIR = path.resolve("uploads");

fs.ensureDir(TEMP_DIR);
fs.ensureDir(COVERS_DIR);
fs.ensureDir(UPLOADS_DIR);

// 配置 multer
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, COVERS_DIR); // 临时保存封面图片
	},
	filename: (req, file, cb) => {
		const uniqueName = `${Date.now()}-${file.originalname}`;
		cb(null, uniqueName);
	},
});

const upload = multer({ storage });

router.post("/video/create", upload.single("cover"), async (req, res) => {
	try {
		const coverFile = req.file;
		if (!coverFile) throw new Error("未上传封面文件");

		const { title, category, description, filename, duration, size, author } =
			req.body;
		const durationInSeconds = parseFloat(duration);

		if (!title || !category) throw new Error("缺少必填字段");

		// 生成最终存储路径
		const finalDir = path.join(
			UPLOADS_DIR,
			"transcoded",
			filename ? path.parse(filename).name : ""
		);
		await fs.ensureDir(finalDir);

		// 新文件名逻辑
		const newCoverName = filename
			? `${path.parse(filename).name}_cover${path.extname(
					coverFile.originalname
			  )}`
			: coverFile.filename;

		// 移动文件
		await fs.rename(
			path.join(COVERS_DIR, coverFile.filename),
			path.join(finalDir, newCoverName)
		);

		// 创建视频记录
		const video = new Video({
			title,
			category,
			description,
			cover: path.join(
				"uploads",
				"transcoded",
				path.parse(filename).name,
				newCoverName
			),
			filePath: [
				{
					transcode: "h264",
					path: path.join(
						"uploads",
						"transcoded",
						path.parse(filename).name,
						"h264",
						"index.mpd"
					),
				},
				{
					transcode: "hevc",
					path: path.join(
						"uploads",
						"transcoded",
						path.parse(filename).name,
						"hevc",
						"index.mpd"
					),
				},
				{
					transcode: "av1",
					path: path.join(
						"uploads",
						"transcoded",
						path.parse(filename).name,
						"av1",
						"index.mpd"
					),
				},
			],
			duration: durationInSeconds,
			size,
			author,
		});
		await video.save();

		res.json({
			success: true,
		});
	} catch (err) {
		res.status(500).json({ success: false, message: err.message });
	}
});

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
	} else {
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
		res.write(
			`data: ${JSON.stringify({ progress: 100, completed: true })}\n\n`
		);
		res.end();

		// 文件合并完成后添加到转码队列
		transcodeQueue.addToQueue(uploadsPath);
	}
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

// 获取分类列表（按order排序）
router.get("/video/categories", async (req, res) => {
	try {
		const {
			page = 1,
			limit = 0,
			search, // 新增搜索参数
			status, // 新增状态筛选
			sortField = "order", // 默认排序字段
			sortOrder = "asc", // 默认排序顺序
		} = req.query;

		// 构建查询条件
		const query = {};

		// 搜索条件
		if (search) {
			query.$or = [
				{ name: { $regex: search, $options: "i" } },
				{ route: { $regex: search, $options: "i" } },
				{ description: { $regex: search, $options: "i" } },
			];
		}

		// 状态筛选
		if (status) {
			query.status = status;
		}

		// 排序逻辑
		const sort = {};
		sort[sortField] = sortOrder === "desc" ? -1 : 1;

		// 分页逻辑
		const skip = (page - 1) * limit;
		const categories = await VideoCate.find(query)
			.sort(sort)
			.skip(skip)
			.limit(parseInt(limit));

		// 总数统计
		const total = await VideoCate.countDocuments(query);

		res.json({
			success: true,
			data: categories,
			total,
			page: parseInt(page),
			limit: parseInt(limit),
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error("获取分类失败:", error);
		res.status(500).json({
			success: false,
			message: "获取分类失败",
			error: error.message,
		});
	}
});

// 更新分类排序
router.put("/video/categories/order", async (req, res) => {
	const { orderedIds } = req.body;

	try {
		// 1. 生成唯一的临时负数值（避免冲突）
		const tempOrders = orderedIds.map((_, index) => -(index + 1) * 1000);

		// 2. 第一阶段：设置唯一临时值
		const stage1Updates = orderedIds.map((id, index) => ({
			updateOne: {
				filter: { _id: id },
				update: { $set: { order: tempOrders[index] } },
			},
		}));
		await VideoCate.bulkWrite(stage1Updates);

		// 3. 第二阶段：设置最终order值
		const stage2Updates = orderedIds.map((id, index) => ({
			updateOne: {
				filter: { _id: id },
				update: { $set: { order: index + 1 } },
			},
		}));
		await VideoCate.bulkWrite(stage2Updates);

		res.json({ success: true });
	} catch (error) {
		console.error("排序更新失败:", error);
		res.status(500).json({
			success: false,
			message:
				error.code === 11000
					? "排序冲突：请确保没有重复的排序值"
					: "更新排序失败",
			error: error.message,
		});
	}
});

// 添加分类
router.post("/video/categories", async (req, res) => {
	try {
		// 获取当前最大order值
		const maxOrder = await VideoCate.findOne()
			.sort("-order")
			.select("order")
			.lean();

		const newCategory = new VideoCate({
			...req.body,
			order: maxOrder ? maxOrder.order + 1 : 1,
		});

		await newCategory.save();
		res.json({ success: true, data: newCategory });
	} catch (error) {
		if (error.code === 11000) {
			res.status(400).json({
				success: false,
				message: "分类名称已存在或分类路由重复",
			});
		} else {
			res.status(500).json({
				success: false,
				message: "创建分类失败",
			});
		}
	}
});

// 更新分类
router.put("/video/categories/:id", async (req, res) => {
	try {
		const updated = await VideoCate.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
		});

		if (!updated) {
			return res.status(404).json({
				success: false,
				message: "分类未找到",
			});
		}

		res.json({ success: true, data: updated });
	} catch (error) {
		if (error.code === 11000) {
			res.status(400).json({
				success: false,
				message: "分类名称已存在或排序值重复",
			});
		} else {
			res.status(500).json({
				success: false,
				message: "更新分类失败",
			});
		}
	}
});

// 删除分类
router.delete("/video/categories/:id", async (req, res) => {
	try {
		const deleted = await VideoCate.findByIdAndDelete(req.params.id);

		if (!deleted) {
			return res.status(404).json({
				success: false,
				message: "分类未找到",
			});
		}

		// 重新排序剩余分类
		await VideoCate.updateMany(
			{ order: { $gt: deleted.order } },
			{ $inc: { order: -1 } }
		);

		res.json({ success: true });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: "删除分类失败",
		});
	}
});

router.get("/video", async (req, res) => {
	try {
		const {
			page = 1,
			limit = 10,
			search,
			category, // 改为category更符合前端参数命名
			sortField = "uploadDate",
			sortOrder = "desc",
		} = req.query;

		// 构建查询条件
		const query = {};

		// 搜索条件
		if (search) {
			query.$or = [
				{ title: { $regex: search, $options: "i" } },
				{ description: { $regex: search, $options: "i" } },
			];
		}

		// 分类筛选条件
		if (category) {
			// 支持传入单个分类ID或分类ID数组
			if (Array.isArray(category)) {
				query.category = { $in: category };
			} else {
				query.category = category;
			}
		}

		// 分页逻辑
		const skip = (page - 1) * limit;

		// 排序逻辑
		const sort = {};
		sort[sortField] = sortOrder === "asc" ? 1 : -1;

		// 查询视频
		const videos = await Video.find(query)
			.sort(sort)
			.skip(skip)
			.limit(parseInt(limit))
			.populate("category", "name route"); // 关联分类信息

		// 总数统计
		const total = await Video.countDocuments(query);

		res.json({
			success: true,
			data: videos,
			total,
			page: parseInt(page),
			limit: parseInt(limit),
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error("获取视频失败:", error);
		res.status(500).json({
			success: false,
			message: "获取视频失败",
			error: error.message,
		});
	}
});

router.get("/video/:id", async (req, res) => {
	try {
		const video = await Video.findById(req.params.id);

		if (!video) {
			return res.status(404).json({ message: "视频未找到" });
		}
		res.json(video);
	} catch (error) {
		console.error("获取视频失败:", error);
	}
});

router.put("/video/:id", async (req, res) => {
	try {
		const updated = await Video.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
		});
		if (!updated) {
			return res.status(404).json({ success: false, message: "视频未找到" });
		}
		res.json({ success: true, data: updated });
	} catch (error) {
		res.status(500).json({ success: false, message: "更新视频失败" });
	}
});

router.delete("/video/:id", async (req, res) => {
	try {
		const video = await Video.findById(req.params.id);
		if (!video) {
			return res.status(404).json({ success: false, message: "视频未找到" });
		}

		const coverPath = video.cover;
		const videoDirName = path.dirname(coverPath).split(path.sep).pop();

		const originalVideoPath = path.join(
			UPLOADS_DIR,
			videoDirName + (".mp4" || ".mov" || ".avi" || ".mkv")
		);

		const transcodedDir = path.join(UPLOADS_DIR, "transcoded", videoDirName);
		await fs.rm(transcodedDir, { recursive: true, force: true });

		await fs.rm(originalVideoPath, { force: true }); // 不递归，因为这是单个文件

		// 4. 删除数据库记录
		const deleted = await Video.findByIdAndDelete(req.params.id);
		if (!deleted) {
			return res.status(404).json({ success: false, message: "视频未找到" });
		}

		res.json({ success: true });
	} catch (error) {
		console.error("删除视频失败:", error);
		res.status(500).json({
			success: false,
			message: "删除视频失败",
			error: error.message,
		});
	}
});

module.exports = router;
