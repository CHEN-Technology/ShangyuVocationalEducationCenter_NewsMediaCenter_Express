const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
	title: { type: String, required: true },
	description: { type: String },
	category: { type: String, required: true },
	fileName: { type: String, required: true },
	filePath: { type: String, required: true },
	fileSize: { type: Number, required: true },
	fileHash: { type: String, required: true, unique: true },
	thumbnailPath: { type: String },
	uploadDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Video", videoSchema);
