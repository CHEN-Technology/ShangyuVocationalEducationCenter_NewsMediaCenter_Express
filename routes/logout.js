const express = require("express");
const router = express.Router();
const User = require("../models/User"); // 引入User模型
const auth = require("../middleware/auth");

router.post("/logout", auth, async (req, res) => {
	try {
		// 可选：在后端使当前token失效（如果需要更严格的安全控制）
		// 递增tokenVersion使当前token失效
		await User.findByIdAndUpdate(req.user._id, {
			$inc: { tokenVersion: 1 },
		});

		// 清除客户端JWT cookie
		res.clearCookie("jwt", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			path: "/",
			// 必须与设置cookie时的domain一致（如果有设置）
			// domain: process.env.COOKIE_DOMAIN
		});

		// 可选：清除其他相关cookie
		// res.clearCookie('otherCookieName');

		return res.status(200).json({
			status: "success",
			message: "注销成功",
		});
	} catch (error) {
		console.error("注销错误:", error);
		return res.status(500).json({
			status: "error",
			error: "注销失败",
			details:
				process.env.NODE_ENV === "development" ? error.message : undefined,
		});
	}
});

module.exports = router;
