import express from 'express';
import { requireAuth } from '../middlewares/clerkAuth';
import {
  submitTutorApplication,
  getMyApplication,
  getAllApplications,
  approveApplication,
  rejectApplication,
  deleteApplication,
  updateApplicationEmail,
} from '../controllers/tutorApplicationController';

const router = express.Router();

// Public: submit tutor application
router.post('/', requireAuth, submitTutorApplication);

// User: get own application status
router.get('/my', requireAuth, getMyApplication);

// Admin: list all applications (optional ?status= filter)
router.get('/', getAllApplications);

// Admin: approve or reject
router.patch('/:applicationId/approve', approveApplication);
router.patch('/:applicationId/reject', rejectApplication);
router.patch('/:applicationId/email', updateApplicationEmail);
router.delete('/:applicationId', deleteApplication);

export default router;
