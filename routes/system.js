const express = require("express");
const router = express.Router();
const Nav = require("../models/Nav");
const System = require("../models/System");
const AvatarMenu = require("../models/AvatarMenu");
const AdminMenu = require("../models/AdminMenu");

router.get("/system", async (req, res) => {
	const system = await System.find()
		.then((data) => {
			return data;
		})
		.catch((err) => {
			return err;
		});

	const navMenu = await Nav.find()
		.then((data) => {
			return data;
		})
		.catch((err) => {
			return err;
		});

	const avatarMenuAll = await AvatarMenu.find()
		.then((data) => {
			return data;
		})
		.catch((err) => {
			return err;
		});

	const AdminMenuAll = await AdminMenu.find()
		.then((data) => {
			return data;
		})
		.catch((err) => {
			return err;
		});

	if (system && navMenu && avatarMenuAll && AdminMenuAll) {
		const returnData = {
			success: true,
			system,
			navMenu,
			avatarMenuAll,
			AdminMenuAll,
		};

		res.json(returnData);
	}
});

module.exports = router;
