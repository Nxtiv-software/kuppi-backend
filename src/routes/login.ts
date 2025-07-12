import { userLogin } from "../controllers/auther";

const express = require("express");

const loginRouter = express.Router();

loginRouter.route("/").post(userLogin);

export default loginRouter;