const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

// 临时存储分片
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const { fileHash, chunkIndex } = req.body;
		const tempDir = path.join(__dirname, "../temp", fileHash);
		fs.ensureDirSync(tempDir);
		cb(null, tempDir);
	},
	filename: (req, file, cb) => {
		const { chunkIndex } = req.body;
		cb(null, `${chunkIndex}`);
	},
});

const upload = multer({ storage });

const handleFileUpload = upload.single("chunk");

module.exports = { handleFileUpload };
