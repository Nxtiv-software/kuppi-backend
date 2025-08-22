// routes/sessions.ts
import express from 'express';
import {
  getSessionRequests,
  acceptSessionRequest,
  declineSessionRequest,
  scheduleSession,
  getMyScheduledSessions,
  getMySessionsAsStudent
} from '../controllers/sessionController';

const router = express.Router();

// Get session requests for tutor (polls with >50% votes)
// For testing: GET /sessions/requests/temp_tutor_id
// In production: GET /sessions/requests (get tutorId from auth)
router.get('/requests/:tutorId?', getSessionRequests);

// Accept a session request
router.post('/requests/:pollId/accept', acceptSessionRequest);

// Decline a session request
router.post('/requests/:pollId/decline', declineSessionRequest);

// Schedule a session after accepting
router.post('/:pollId/schedule', scheduleSession);

// Get scheduled sessions for a tutor
// For testing: GET /sessions/scheduled/temp_tutor_id
// In production: GET /sessions/scheduled (get tutorId from auth)
router.get('/scheduled/:tutorId?', getMyScheduledSessions);

// Get sessions for a student (polls they voted on)
// For testing: GET /sessions/my-sessions or GET /sessions/my-sessions/temp_student_id
// In production: GET /sessions/my-sessions (get studentId from auth)
router.get('/my-sessions/:studentId?', getMySessionsAsStudent);

export default router;
