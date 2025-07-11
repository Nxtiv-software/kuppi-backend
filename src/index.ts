import "dotenv/config"
import express from "express";
import { connectDB } from "./config/db";
import cors from "cors"
import userRouter from "./routes/user";

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.use('/user', userRouter);

app.listen(8000, () => console.log("Server is listening on port 8000."));
