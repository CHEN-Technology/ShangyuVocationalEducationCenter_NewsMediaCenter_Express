const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
	title: { type: String, required: true },
	description: { type: String },
	category: { type: String, required: true },
	cover: { type: String, required: true },
	filePath: [
		{
			transcode: { type: String, required: true },
			path: { type: String, required: true },
		},
	],
	uploadDate: { type: Date, default: Date.now },
	status: { type: String },
	hits: { type: Number, default: 0 },
	duration: { type: Number },
	size: { type: Number },
	author: { type: String, required: true },
});

module.exports = mongoose.model("Video", videoSchema);
