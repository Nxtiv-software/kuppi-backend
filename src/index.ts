const express = require("express");
const cors = require("cors")
import "dotenv/config"
import { connectDB } from "./config/db";
import userRouter from "./routes/user";
import signUpRouter from "./routes/signup";
import loginRouter from "./routes/login";
import router from "./routes/polls";
import refreshRouter from "./routes/refreshToken";

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.urlencoded({ extended: true }));

connectDB();


app.use('/auth', signUpRouter);
app.use('/auth', refreshRouter);
app.use('/login', loginRouter);
app.use('/polls', router);

app.listen(8000, () => console.log("Server is listening on port 8000."));
