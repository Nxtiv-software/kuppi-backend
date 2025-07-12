import { Request, Response, NextFunction } from "express";
import User from "../models/user";

const dotenv = require("dotenv");
dotenv.config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

interface JwtPayload {
  _id: string;
  email: string;
}

async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer")) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const token = authHeader?.split(" ")[1];
    const decodedInfo = jwt.verify(token, JWT_SECRET as String) as JwtPayload;

    const user = await User.findById(decodedInfo._id);
    console.log(user);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    (req as any).user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

export default authenticateUser;
