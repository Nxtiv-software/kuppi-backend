// import { userLogin } from "../controllers/auther";

// const express = require("express");

// const loginRouter = express.Router();

// loginRouter.route("/").post(userLogin);

// export default loginRouter;

import { userLogin, userLogout } from "../controllers/auther";

const express = require("express");

const loginRouter = express.Router();

// Login route
loginRouter.route("/").post(userLogin);

// Logout route
loginRouter.route("/logout").post(userLogout);

export default loginRouter;