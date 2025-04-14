const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

router.post("/login", async function (req, res, next) {
	try {
		const user = await User.findOne({
			username: req.body.username,
			identity: req.body.identity,
		});

		if (!user) return res.status(422).json({ error: "用户不存在" });

		const isPasswordValid = bcrypt.compareSync(
			req.body.password,
			user.password
		);
		if (!isPasswordValid) return res.status(422).json({ error: "密码错误" });

		await User.findByIdAndUpdate(user._id, { lastLoginTime: new Date() });

		// 生成包含tokenVersion的JWT
		const token = jwt.sign(
			{
				id: String(user._id),
				tokenVersion: user.tokenVersion, // 添加tokenVersion到payload
			},
			process.env.JWT_SECRET,
			{
				expiresIn: "1d",
			}
		);

		// 设置HttpOnly Cookie
		res.cookie("jwt", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			maxAge: 86400000, // 1天
			path: "/",
		});

		res.status(200).json({
			status: "success",
			message: "登录成功",
			data: { user },
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "登录失败" });
	}
});

module.exports = router;
