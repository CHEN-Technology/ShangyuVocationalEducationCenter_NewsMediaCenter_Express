const mongoose = require("mongoose");

const TitleSchema = new mongoose.Schema({
	title: { type: String, required: true },
	subTitle: { type: String, required: true },
	link: { type: String, required: true },
});

module.exports = mongoose.model("Title", TitleSchema);
