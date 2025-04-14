const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

router.get("/profile", auth, async (req, res) => {
	if (!req.user) return res.status(401).json({ message: "Unauthorized" });
	res.json(req.user);
});

module.exports = router;
