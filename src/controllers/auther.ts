const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
import { Request, Response } from "express";
import User from "../models/user";
import { ObjectId } from "mongodb";

function createToken(userId: ObjectId, name: String) {
  return jwt.sign({ userId, name }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

export async function addUser(req: Request, res: Response) {
  const { name, email, password } = req.body;

  try {
    const checkExisitingUser = await User.findOne({ email });

    if (checkExisitingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, password: hashedPassword });
    console.log(user._id, user.name, user.password);

    const token = createToken(user._id, user.email);
    console.log(token);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("Register Error", err);
    res.status(400).send("User not created");
  }
  return res.status(201).send();
}

export async function userLogin(req: Request, res: Response) {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or Password",
      });
    }

    const isValidpassword = await bcrypt.compare(password, user.password);

    if (!isValidpassword) {
      return res.status(401).json({
        error: "Invalid password or password",
      });
    }

    const token = createToken(user._id, user.email);
    res.json({
      user: {
        id: user._id,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.log("Login error", err);
    res.status(400).send("User not found");
  }
  return res.status(201).send();
}
