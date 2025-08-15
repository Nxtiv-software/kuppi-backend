import express from 'express';
const router = express.Router();

// Placeholder webhook endpoint
router.post('/webhook', (req, res) => {
  console.log('Clerk webhook received:', req.body);
  res.status(200).json({ success: true });
});

export default router;