import express from "express";
import { addUser } from "../application/user";

const userRouter = express.Router();

userRouter.route("/").post(addUser);

export default userRouter;
