const { body, validationResult } = require("express-validator");

const validateUpload = [
	body("title").notEmpty().withMessage("视频标题不能为空"),
	body("description").optional().isString(),
	body("category").notEmpty().withMessage("视频分类不能为空"),
	(req, res, next) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}
		next();
	},
];

module.exports = { validateUpload };
