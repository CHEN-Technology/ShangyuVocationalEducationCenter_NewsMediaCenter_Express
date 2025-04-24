const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Shanghai");
const User = require("./models/User");
const Nav = require("./models/Nav");
const AvatarMenu = require("./models/AvatarMenu");
const Title = require("./models/Title");
const AdminMenu = require("./models/AdminMenu");
const VideoCate = require("./models/VideoCate");

const connectionStates = {
	0: "disconnected", // 未连接
	1: "connected", // 已连接
	2: "connecting", // 连接中
	3: "disconnecting", // 断开中
};

function monitorConnection() {
	const currentState = mongoose.connection.readyState;
	console.log(
		`[${moment().format("YYYY-MM-DD HH:mm:ss")}] 数据库状态:`,
		`${connectionStates[currentState]} (${currentState})`
	);

	const statusMessages = {
		0: "❌ 数据库未连接，请检查MongoDB服务是否运行",
		1: "✅ 数据库连接正常",
		2: "🔄 正在尝试连接数据库...",
		3: "⏳ 数据库正在断开连接",
	};
	console.log(statusMessages[currentState]);
}

mongoose.connection.on("connecting", () => {
	monitorConnection();
	console.log("ℹ️ 正在建立数据库连接...");
});

mongoose.connection.on("connected", () => {
	monitorConnection();
	console.log("✨ 成功连接到MongoDB服务器");
});

mongoose.connection.on("disconnected", () => {
	monitorConnection();
	console.log("⚠️ 数据库连接已断开");
});

mongoose.connection.on("reconnected", () => {
	monitorConnection();
	console.log("♻️ 数据库重新连接成功");
});

mongoose.connection.on("error", (error) => {
	monitorConnection();
	console.error("‼️ 数据库连接错误:", error.message);
});

// 初始化数据库连接
mongoose.connect(process.env.MONGODB_URI, {
	serverSelectionTimeoutMS: 5000,
	socketTimeoutMS: 30000,
	connectTimeoutMS: 30000,
	retryWrites: true,
});

mongoose.connection.once("open", async () => {
	try {
		const adminExists = await User.findOne({ identity: 0 });
		if (!adminExists) {
			await Nav.insertMany([
				{
					title: "首页",
					link: "/",
					order: 0,
				},
				{
					title: "直播",
					link: "/live",
					order: 1,
				},
			]);

			await AvatarMenu.insertMany([
				{
					title: "我的资料",
					link: "/user",
					order: 0,
					icon: "User",
				},
				{
					title: "我的收藏",
					link: "/favorite",
					order: 1,
					icon: "Star",
				},
				{
					title: "我的评论",
					link: "/comment",
					order: 2,
					icon: "MessageCircle",
				},
				{
					title: "控制台",
					link: "/admin",
					order: 3,
					icon: "LayoutDashboard",
				},
				{
					title: "退出登录",
					link: "/logout",
					order: 4,
					icon: "LogOut",
				},
			]);

			await Title.insertOne({
				title: "上虞职业教育中心",
				subTitle: "新闻媒体中心",
				link: "/",
			});

			await User.create({
				username: "admin",
				password: "syadmin",
				identity: 0,
			});

			await AdminMenu.insertMany([
				{
					title: "首页",
					link: "/admin",
					order: 0,
					icon: "Home",
					subTab: [],
				},
				{
					title: "用户管理",
					link: "/admin/users",
					order: 1,
					icon: "Users",
					subTab: [],
				},
				{
					title: "视频管理",
					link: "/admin/video",
					order: 2,
					icon: "Video",
					subTab: [
						{
							title: "分类管理",
							link: "/admin/video/cate",
						},
						{
							title: "视频管理",
							link: "/admin/video/list",
						},
					],
				},
				{
					title: "评论管理",
					link: "/admin/comment",
					order: 3,
					icon: "MessageCircle",
					subTab: [],
				},
				{
					title: "系统设置",
					link: "/admin/setting",
					order: 4,
					icon: "Settings",
					subTab: [],
				},
			]);

			await VideoCate.insertMany([
				{
					name: "全部",
					status: true,
					order: 1,
				},
				{
					name: "视频",
					status: true,
					order: 2,
				},
				{
					name: "直播",
					status: true,
					order: 3,
				},
				{
					name: "图文",
					status: true,
					order: 4,
				},
			]);

			console.log("管理员账号自动创建成功");
			console.log(
				`默认管理员账户：admin\t默认密码：syadmin\t注意：请及时修改密码！`
			);
		}
	} catch (error) {
		console.error("初始化管理员账号失败:", error.message);
	}
});

module.exports = { User, Nav, AvatarMenu, Title, AdminMenu, VideoCate };
