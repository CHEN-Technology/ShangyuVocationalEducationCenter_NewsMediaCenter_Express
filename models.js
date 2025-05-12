const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Shanghai");
const schedule = require("node-schedule");
const User = require("./models/User");
const Nav = require("./models/Nav");
const AvatarMenu = require("./models/AvatarMenu");
const System = require("./models/System");
const AdminMenu = require("./models/AdminMenu");
const Video = require("./models/Video");
const VideoCate = require("./models/VideoCate");

const connectionStates = {
	0: "disconnected", // 未连接
	1: "connected", // 已连接
	2: "connecting", // 连接中
	3: "disconnecting", // 断开中
};

// 添加每月统计视频数量的函数
async function updateMonthlyVideoStats() {
	try {
		const currentMonthStart = moment().startOf("month").toDate();
		const count = await Video.countDocuments();

		// 查询系统记录
		const systemData = await System.findOne({});

		if (systemData?.monthlyVideoStats?.length > 0) {
			const latestStat = systemData.monthlyVideoStats[0];
			const isSameMonth = moment(latestStat.date).isSame(
				currentMonthStart,
				"month"
			);

			if (isSameMonth) {
				// 1. 时间未改变，但值改变 → 覆盖
				if (latestStat.count !== count) {
					await System.updateOne(
						{ "monthlyVideoStats.date": currentMonthStart },
						{
							$set: {
								"monthlyVideoStats.$.count": count,
								lastStatsUpdate: new Date(),
							},
						}
					);
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] 更新当月视频统计: ${count}条 (${moment(
							currentMonthStart
						).format("YYYY-MM")})`
					);
				} else {
					console.log(
						`[${moment().format(
							"YYYY-MM-DD HH:mm:ss"
						)}] 本月数据未变化，无需更新: ${count}条 (${moment(
							currentMonthStart
						).format("YYYY-MM")})`
					);
				}
				return; // 无论是否更新，同月数据已处理完毕
			}
		}

		// 2. 时间改变（新月份）→ 新增记录（无论值是否改变）
		await System.updateOne(
			{},
			{
				$push: {
					monthlyVideoStats: {
						$each: [
							{
								date: currentMonthStart,
								count: count,
							},
						],
						$sort: { date: -1 },
						$slice: 100,
					},
				},
				$set: {
					lastStatsUpdate: new Date(),
				},
			},
			{ upsert: true }
		);

		console.log(
			`[${moment().format(
				"YYYY-MM-DD HH:mm:ss"
			)}] 新增视频月统计: ${count}条 (${moment(currentMonthStart).format(
				"YYYY-MM"
			)})`
		);
	} catch (error) {
		console.error("更新视频月统计失败:", error.message);
	}
}
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

			await System.insertOne({
				title: {
					title: "上虞职业教育中心",
					subTitle: "新闻媒体中心",
					link: "/",
				},
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
					name: "游戏",
					value: "game",
					status: true,
					order: 1,
				},
				{
					name: "娱乐",
					value: "entertainment",
					status: true,
					order: 2,
				},
				{
					name: "影视",
					value: "movie",
					status: true,
					order: 3,
				},
				{
					name: "音乐",
					value: "music",
					status: true,
					order: 4,
				},
			]);

			console.log("管理员账号自动创建成功");
			console.log(
				`默认管理员账户：admin\t默认密码：syadmin\t注意：请及时修改密码！`
			);
		}

		const job = schedule.scheduleJob("0 0 0 1 * *", async () => {
			console.log(
				`[${moment().format("YYYY-MM-DD HH:mm:ss")}] 执行每月视频统计任务`
			);
			await updateMonthlyVideoStats();
		});

		// 立即执行一次，确保当月数据被记录（可选）
		await updateMonthlyVideoStats();

		console.log("✅ 已设置每月视频统计定时任务");
	} catch (error) {
		console.error("初始化管理员账号失败:", error.message);
	}
});
