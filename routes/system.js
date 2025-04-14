const express = require("express");
const router = express.Router();
const Nav = require("../models/Nav");
const Title = require("../models/Title");
const AvatarMenu = require("../models/AvatarMenu");
const AdminMenu = require("../models/AdminMenu");

router.get("/system", async (req, res) => {
	const titleAll = await Title.find()
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

	const returnData = {
		titleAll,
		navMenu,
		avatarMenuAll,
		AdminMenuAll,
	};

	res.json(returnData);
});

module.exports = router;
