const express = require("express");
import {addUser} from "../controllers/auther"

const signUpRouter = express.Router();

signUpRouter.route("/").post(addUser);

export default signUpRouter;