const createError = require("http-errors");
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const bodyParser = require("body-parser");

const indexRouter = require("./routes/index");
const loginRouter = require("./routes/login");
const registerRouter = require("./routes/register");
// const uploadRouter = require("./routes/upload");
const usersRouter = require("./routes/users");
const profileRouter = require("./routes/profile");
const systemRouter = require("./routes/system");
const logoutRouter = require("./routes/logout");
const videoRoutes = require("./routes/video");

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(cors({ origin: process.env.URL, credentials: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use("/", indexRouter);
app.use("/api", loginRouter);
app.use("/api", registerRouter);
// app.use("/api", uploadRouter);
app.use("/api", usersRouter);
app.use("/api", profileRouter);
app.use("/api", systemRouter);
app.use("/api", logoutRouter);
app.use("/api", videoRoutes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get("env") === "development" ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render("error");
});

module.exports = app;

