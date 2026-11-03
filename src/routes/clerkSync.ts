import express from 'express';
import { syncUsersFromClerk, syncUserFromClerk } from '../controllers/clerkSync';

const router = express.Router();

// Sync all users from Clerk to MongoDB
router.post('/sync-all', syncUsersFromClerk);

// Sync specific user from Clerk to MongoDB
router.post('/sync-user/:userId', syncUserFromClerk);

export default router;