const mongoose = require("mongoose");

const NavSchema = new mongoose.Schema({
	title: { type: String, required: true, unique: true },
	link: { type: String, required: true, unique: true },
	order: { type: Number, default: 0, unique: true },
});

module.exports = mongoose.model("Nav", NavSchema);
