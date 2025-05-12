const mongoose = require("mongoose");
const Video = require("./Video");

const SystemSchema = new mongoose.Schema({
	title: {
		title: { type: String, required: true },
		subTitle: { type: String, required: true },
		link: { type: String, required: true },
	},
	monthlyVideoStats: [
		{
			date: { type: Date, required: true }, // 记录日期（每月第一天）
			count: { type: Number, required: true }, // 视频总数
		},
	],
});

module.exports = mongoose.model("System", SystemSchema);
