// routes/sessions.ts
import express, { Request, Response } from 'express';
import {
  getSessionRequests,
  acceptSessionRequest,
  declineSessionRequest,
  scheduleSession,
  getMyScheduledSessions,
  getMySessionsAsStudent
} from '../controllers/sessionController';
import { requireAuth, AuthenticatedRequest } from '../middlewares/clerkAuth';

const router = express.Router();

// Health check for authentication
router.get('/auth-test', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    success: true,
    message: 'Authentication working!',
    userId: authReq.auth.userId,
    timestamp: new Date().toISOString()
  });
});

// Get session requests for tutor (polls with >50% votes)
// Protected route - requires authentication
router.get('/requests/:tutorId?', requireAuth, getSessionRequests);
router.get('/requests', requireAuth, getSessionRequests); // Alternative endpoint without tutorId

// Accept a session request - protected route
router.post('/requests/:pollId/accept', requireAuth, acceptSessionRequest);

// Decline a session request - protected route
router.post('/requests/:pollId/decline', requireAuth, declineSessionRequest);

// Schedule a session after accepting - protected route
router.post('/:pollId/schedule', requireAuth, scheduleSession);

// Get scheduled sessions for a tutor - protected route
router.get('/scheduled/:tutorId?', requireAuth, getMyScheduledSessions);

// Alternative endpoint for tutor schedule (matches frontend API)
router.get('/tutor-schedule', requireAuth, getMyScheduledSessions);

// Get sessions for a student (polls they voted on) - protected route
router.get('/my-sessions/:studentId?', requireAuth, getMySessionsAsStudent);

export default router;
