const mongoose = require("mongoose");

const AdminMenuSchema = new mongoose.Schema({
	title: { type: String, required: true },
	link: { type: String, required: true },
	order: { type: Number, default: 0 },
	icon: { type: String, default: "" },
	subTab: {
		type: [
			{
				title: { type: String },
				link: { type: String },
				order: { type: Number, default: 0 },
				icon: { type: String, default: "" },
			},
		],
		default: [],
	},
});

module.exports = mongoose.model("AdminMenu", AdminMenuSchema);
