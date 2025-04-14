const mongoose = require("mongoose");

const AvatarMenuSchema = new mongoose.Schema({
	title: { type: String, required: true },
	link: { type: String, required: true },
	order: { type: Number, default: 0 },
	icon: { type: String, default: "" },
});

module.exports = mongoose.model("AvatarMenu", AvatarMenuSchema);
