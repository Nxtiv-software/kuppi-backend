import express from "express";
import { addUser } from "../controllers/user";

const userRouter = express.Router();

// FOR LOCALHOST TESTING: Skip authentication middleware
// Comment out this line when deploying
userRouter.use((req, res, next) => {
  console.log('Skipping authentication for user routes - localhost testing');
  
  // Mock user in request if needed by controllers
  if (!(req as any).user) {
    (req as any).user = {
      _id: 'test-user-123',
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com'
    };
  }
  
  next();
});

// AUTHENTICATION: Apply authentication middleware when deploying
// Uncomment when deploying with authentication
// import authenticateUser from '../middlewares/auth';
// userRouter.use(authenticateUser);

userRouter.route("/").post(addUser);

export default userRouter;