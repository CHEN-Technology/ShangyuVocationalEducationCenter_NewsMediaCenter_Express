const uploadService = require("../services/uploadService");

exports.initUpload = async (req, res) => {
	try {
		const { title, description, category, fileHash, fileName, fileSize } =
			req.body;
		const result = await uploadService.initUpload({
			title,
			description,
			category,
			fileHash,
			fileName,
			fileSize,
		});
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

exports.uploadChunk = async (req, res) => {
	try {
		const { fileHash, chunkIndex, totalChunks } = req.body;
		const result = await uploadService.saveChunk({
			fileHash,
			chunkIndex,
			totalChunks,
			file: req.file,
		});
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

exports.completeUpload = async (req, res) => {
	try {
		const { fileHash, fileName, fileSize, title, description, category } =
			req.body;
		const result = await uploadService.mergeChunks({
			fileHash,
			fileName,
			fileSize,
			title,
			description,
			category,
		});
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

exports.verifyFile = async (req, res) => {
	try {
		const { fileHash } = req.body;
		const result = await uploadService.verifyFile(fileHash);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};
