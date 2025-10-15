// routes/sessions.ts
import express, { Request, Response } from 'express';
import {
  getSessionRequests,
  acceptSessionRequest,
  declineSessionRequest,
  scheduleSession,
  getMyScheduledSessions,
  getMySessionsAsStudent,
  getAcceptedSessions,
  addMeetingLink,
  addSessionAttachment,
  addSessionAnnouncement,
  downloadAttachment,
  getAvailableSessions,
  joinSession,
  createTutorSession,
  getTutorCreatedSessions,
  showInterestInSession,
  scheduleTutorSession,
  markSessionCompleted
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

// Get accepted sessions that need scheduling - protected route
router.get('/accepted/:tutorId?', requireAuth, getAcceptedSessions);

// Alternative endpoint for tutor schedule (matches frontend API)
router.get('/tutor-schedule', requireAuth, getMyScheduledSessions);

// Get sessions for a student (polls they voted on) - protected route
router.get('/my-sessions/:studentId?', requireAuth, getMySessionsAsStudent);

// Get available sessions for browsing - protected route
router.get('/available', requireAuth, getAvailableSessions);

// Join a session - protected route
router.post('/:sessionId/join', requireAuth, joinSession);

// Create a new session by tutor - protected route
router.post('/create', requireAuth, createTutorSession);

// Get tutor's created sessions - protected route
router.get('/tutor/created', requireAuth, getTutorCreatedSessions);

// Show interest in a tutor-created session - protected route
router.post('/:sessionId/interest', requireAuth, showInterestInSession);

// Schedule a tutor-created session when ready - protected route
router.post('/:sessionId/schedule-tutor', requireAuth, scheduleTutorSession);

// Mark session as completed - protected route
router.post('/:sessionId/complete', requireAuth, markSessionCompleted);

// Session Resource Management - protected routes
// Add meeting link to a session
router.post('/:sessionId/meeting-link', requireAuth, addMeetingLink);

// Add attachment to a session (with file upload)
router.post('/:sessionId/attachment', requireAuth, addSessionAttachment);

// Add announcement to a session
router.post('/:sessionId/announcement', requireAuth, addSessionAnnouncement);

// Download attachment from a session
router.get('/:sessionId/attachments/:fileName', requireAuth, downloadAttachment);

export default router;
