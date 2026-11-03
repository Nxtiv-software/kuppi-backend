import express from 'express';
import { handleClerkWebhook } from '../controllers/clerkWebhook';

const router = express.Router();

// Clerk webhook endpoint - syncs users from Clerk to MongoDB
router.post('/webhook', express.raw({ type: 'application/json' }), handleClerkWebhook);

export default router;