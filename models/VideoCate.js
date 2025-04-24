const mongoose = require("mongoose");

const VideoCateSchema = new mongoose.Schema({
	name: { type: String, required: true, unique: true },
	createdAt: { type: Date, default: Date.now },
	status: { type: Boolean, default: true },
	order: { type: Number, default: 0, unique: true },
});

module.exports = mongoose.model("VideoCateSchema", VideoCateSchema);
