const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.post("/register", async function (req, res, next) {
	const { identity, username, password } = req.body;

	if (!username || !password) {
		return res.json({
			status: "error",
			message: "请输入用户名和密码",
		});
	}

	if (username === "admin" || username === "root") {
		return res.json({
			status: "error",
			message: `用户名不能为 ${username}`,
		});
	}

	try {
		const existingUser = await User.findOne({ username: username });

		if (existingUser) {
			return res.json({
				status: "error",
				message: "用户名已存在",
			});
		}
	} catch (error) {
		return res.json({
			status: "error",
			message: "一个错误发生",
		});
	}

	if (identity === 0) {
		return res.json({
			status: "error",
			message: `只能有一个管理员`,
		});
	}

	const user = await User.create({
		identity: identity,
		username: username,
		password: password,
	});

	res.status(200).json({
		status: "success",
		message: "注册成功",
		data: user,
	});
});

module.exports = router;
