import { Request, Response } from "express";
import User from "../infrastructure/schemas/user";

export const addUser = async(req: Request, res: Response) => {
    const answer = req.body;
    await User.create(answer);
    return res.status(201).send();
}