const crypto = require("crypto");
const fs = require("fs-extra");

function calculateFileHash(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("md5");
		const stream = fs.createReadStream(filePath);

		stream.on("data", (data) => hash.update(data));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}

function getFileHash(buffer) {
	return crypto.createHash("md5").update(buffer).digest("hex");
}

module.exports = { calculateFileHash, getFileHash };
