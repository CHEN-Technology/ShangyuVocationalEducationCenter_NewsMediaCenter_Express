const mongoose = require("mongoose");
const moment = require("moment-timezone");

const UserSchema = new mongoose.Schema({
	username: { type: String, required: true, unique: true },
	password: {
		type: String,
		required: true,
		set(val) {
			return require("bcrypt").hashSync(val, 10);
		},
	},
	avatar: {
		type: String,
		default: "",
	},
	identity: { type: Number, required: true },
	registerTime: {
		type: Date,
		default: Date.now,
		get: (date) => moment(date).tz("Asia/Shanghai").format(),
	},
	lastLoginTime: {
		type: Date,
		default: Date.now,
		get: (date) => moment(date).tz("Asia/Shanghai").format(),
	},
	tokenVersion: {
		type: Number,
		default: 0,
	},
});

UserSchema.set("toJSON", { getters: true });
UserSchema.set("toObject", { getters: true });

module.exports = mongoose.model("User", UserSchema);
