const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/uploadController");
const { validateUpload } = require("../middleware/validate");
const { handleFileUpload } = require("../middleware/fileUpload");

// 初始化上传
router.post("/video/upload/init", validateUpload, uploadController.initUpload);

// 上传分片
router.post(
	"/video/upload/chunk",
	handleFileUpload,
	uploadController.uploadChunk
);

// 完成上传
router.post("/video/upload/complete", uploadController.completeUpload);

// 验证文件是否已存在（秒传）
router.post("/video/upload/verify", uploadController.verifyFile);

module.exports = router;
