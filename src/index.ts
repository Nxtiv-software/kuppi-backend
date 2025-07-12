const express = require("express");
const cors = require("cors")
import "dotenv/config"
import { connectDB } from "./config/db";
import userRouter from "./routes/user";
import signUpRouter from "./routes/signup";
import loginRouter from "./routes/login";

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.use('/user', userRouter);
app.use('/auth', signUpRouter);
app.use('/login', loginRouter);

app.listen(8000, () => console.log("Server is listening on port 8000."));
