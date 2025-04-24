const express = require("express");
const router = express.Router();
const User = require("../models/User");
const auth = require("../middleware/auth");

router.get("/users", auth, async (req, res) => {
	try {
		const {
			page = 1,
			limit = 11,
			search, // 搜索关键词
			identity,
		} = req.query;

		// 构建查询条件
		const query = {};

		// 模糊搜索：用户名或邮箱包含关键词
		if (search) {
			query.$or = [
				{ username: { $regex: search, $options: "i" } }, // 用户名模糊匹配
			];
		}

		// 身份筛选
		if (identity !== undefined) {
			query.identity = parseInt(identity);
		}

		// 分页逻辑
		const skip = (page - 1) * limit;
		const users = await User.find(query).skip(skip).limit(parseInt(limit));
		console.log(users);

		// 总数统计
		const total = await User.countDocuments(query);

		res.json({
			data: users,
			total,
			page: parseInt(page),
			limit: parseInt(limit),
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		res.status(500).json({ message: "搜索用户失败", error: error.message });
	}
});

router.patch("/users/resetPassword", auth, async function (req, res, next) {
	try {
		const { id } = req.body;
		if (!id) return res.status(400).json({ message: "ID 不能为空" });

		const updatedUser = await User.findByIdAndUpdate(
			id,
			{
				password: "123456",
				$inc: { tokenVersion: 1 }, // 递增tokenVersion使旧JWT失效
			},
			{ new: true }
		);

		if (!updatedUser) return res.status(404).json({ message: "用户不存在" });
		res.json({ message: "密码重置成功" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "重置密码失败" });
	}
});

// 在update路由中
router.put("/users/update", auth, async function (req, res, next) {
	try {
		const { id, username, identity } = req.body;
		if (!id || !username || ![0, 1, 2].includes(identity)) {
			return res
				.status(400)
				.json({ message: "ID, Username 和 identity 不能为空" });
		}

		const updatedUser = await User.findByIdAndUpdate(
			id,
			{
				username,
				identity,
				$inc: { tokenVersion: 1 }, // 递增tokenVersion使旧JWT失效
			},
			{ new: true }
		);

		res.status(200).json({ message: "用户更新成功" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "用户更新失败" });
	}
});

router.post("/users/add", auth, async function (req, res, next) {
	try {
		const { username, identity } = req.body;
		if (!username || ![0, 1, 2].includes(identity)) {
			return res.status(400).json({ message: "Username 和 identity 不能为空" });
		}

		if (username === "admin" || username === "root") {
			return res.status(400).json({
				status: "error",
				message: `用户名不能为 ${username}`,
			});
		}

		try {
			const existingUser = await User.findOne({ username: username });

			console.log(existingUser);

			if (existingUser) {
				return res.status(400).json({
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
			return res.status(400).json({
				status: "error",
				message: `只能有一个管理员`,
			});
		}

		const user = await User.create({
			identity: identity,
			username: username,
			password: "123456",
		});

		res.status(200).json({ message: "添加用户成功", data: user });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "添加用户失败" });
	}
});

router.delete("/users/delete", auth, async function (req, res, next) {
	try {
		const { id } = req.body;
		if (!id) {
			return res.status(400).json({ message: "ID 不能为空" });
		}
		const deletedUser = await User.findByIdAndDelete(id);
		if (!deletedUser) {
			return res.status(404).json({ message: "User not found" });
		}
		res.status(200).json({ message: "用户删除成功" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "用户删除失败" });
	}
});

module.exports = router;
