const { User } = require("../models");
const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
	try {
		const token = req.cookies.jwt; // 从Cookie读取

		if (!token) return res.status(401).json({ error: "未登录" });

		// 验证JWT并解码
		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		// 查找用户并验证tokenVersion
		const user = await User.findById(decoded.id);
		if (!user) return res.status(401).json({ error: "用户不存在" });

		// 检查tokenVersion是否匹配
		if (user.tokenVersion !== decoded.tokenVersion) {
			return res.status(401).json({ error: "会话已过期，请重新登录" });
		}

		req.user = user;
		next();
	} catch (err) {
		// 处理各种JWT错误
		if (err.name === "TokenExpiredError") {
			return res.status(401).json({ error: "登录已过期" });
		}
		if (err.name === "JsonWebTokenError") {
			return res.status(401).json({ error: "无效的Token" });
		}
		console.error(err);
		res.status(500).json({ error: "认证失败" });
	}
};

module.exports = auth;
