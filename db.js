const sql = require("mysql2");

const connection = sql.createConnection({
	host: "localhost",
	user: "root",
	password: "root",
});

const pool = sql.createPool({
	host: "localhost",
	user: "root",
	password: "root",
	database: "test",
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

const query = (sql, values) => {
	return new Promise((resolve, reject) => {
		connection.query(sql, values, (err, result) => {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	});
};

const query2 = (sql, values) => {
	return new Promise((resolve, reject) => {
		pool.getConnection((err, connection) => {
			if (err) {
				reject(err);
			} else {
				connection.query(sql, values, (err, result) => {
					if (err) {
						reject(err);
					} else {
						resolve(result);
					}
				});
				connection.release();
			}
		});
	});
};

const createDB = async () => {
	try {
		await query(
			"CREATE DATABASE IF NOT EXISTS test DEFAULT CHARSET utf8 COLLATE utf8_general_ci"
		);
		console.log("Database created");
		return true;
	} catch (err) {
		console.error("Error creating database:", err);
		return false;
	}
};

const createTabUsers = async () => {
	try {
		await query2(
			"CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100), password VARCHAR(100), identity TINYINT(10) DEFAULT 2, registerTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP, avatar VARCHAR(100), lastLoginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
		);
		console.log("usersTable created");
		return true;
	} catch (err) {
		console.error("Error creating usersTable:", err);
		return false;
	}
};

const createTabVideos = async () => {
	try {
		await query2(
			"CREATE TABLE IF NOT EXISTS videos (id INT AUTO_INCREMENT PRIMARY KEY, createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP, title VARCHAR(100), description CHAR(255), video VARCHAR(100), cover VARCHAR(100), playCount INT DEFAULT 0)"
		);
		console.log("videosTable created");
		return true;
	} catch (err) {
		console.error("Error creating videosTable:", err);
		return false;
	}
};

const insertAdmin = async () => {
	try {
		await query2(
			"INSERT INTO users (username, password, identity, avatar) VALUES (?, ?, ?, ?)",
			[
				"admin",
				"syadmin",
				0,
				"https://avatars.githubusercontent.com/u/10614704?v=4",
			]
		);
		console.log("Admin inserted");
		return true;
	} catch (err) {
		console.error("Error inserting admin:", err);
		return false;
	}
};

const findAdmin = async () => {
	try {
		const result = await query2("SELECT * FROM users WHERE identity = ?", [0]);
		if (result.length > 0) {
			return true;
		}
	} catch (err) {
		return false;
	}
};

async function create() {
	const isInit = await findAdmin();
	console.log("欢迎使用本后端程序");

	if (!isInit) {
		if (
			(await createDB()) &&
			(await createTabUsers()) &&
			(await createTabVideos()) &&
			(await insertAdmin())
		) {
			console.log("初始化成功!");
			console.log(
				`默认管理员账户：admin`,
				`密码：默认管理员账户：admin`,
				`本提示只显示一次，请及时修改密码！！！`
			);
		}
	}
}

connection.connect((err) => {
	if (err) {
		console.error("Error connecting to MySQL:", err);
		return;
	}
	console.log("Connected to MySQL");
	create();
});

module.exports = { pool };
