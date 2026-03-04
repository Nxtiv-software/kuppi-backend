import express from 'express';
import { requireAuth } from '../middlewares/clerkAuth';
import { isAdmin } from '../middlewares/adminAuth';
import {
  getAdminOverview,
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  getAllSessions,
  deleteSession,
  getAllPolls,
  deletePoll,
  getSystemAnalytics
} from '../controllers/adminController';

const router = express.Router();

// Apply Clerk authentication to all admin routes
router.use(requireAuth);

// Apply admin authorization to all routes
router.use(isAdmin);

/**
 * @route   GET /api/admin/overview
 * @desc    Get admin dashboard overview statistics
 * @access  Private (Admin only)
 */
router.get('/overview', getAdminOverview);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get system analytics (charts, trends, etc.)
 * @access  Private (Admin only)
 */
router.get('/analytics', getSystemAnalytics);

// ==================== USER MANAGEMENT ====================

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination and filters
 * @access  Private (Admin only)
 */
router.get('/users', getAllUsers);

/**
 * @route   POST /api/admin/users
 * @desc    Create new user (syncs with Clerk)
 * @access  Private (Admin only)
 */
router.post('/users', createUser);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get single user details
 * @access  Private (Admin only)
 */
router.get('/users/:userId', getUser);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Update user details (syncs with Clerk)
 * @access  Private (Admin only)
 */
router.put('/users/:userId', updateUser);

/**
 * @route   PATCH /api/admin/users/:userId/role
 * @desc    Update user role (syncs with Clerk publicMetadata)
 * @access  Private (Admin only)
 */
router.patch('/users/:userId/role', updateUserRole);

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete user (syncs with Clerk)
 * @access  Private (Admin only)
 */
router.delete('/users/:userId', deleteUser);

// ==================== SESSION MANAGEMENT ====================

/**
 * @route   GET /api/admin/sessions
 * @desc    Get all sessions with pagination and filters
 * @access  Private (Admin only)
 */
router.get('/sessions', getAllSessions);

/**
 * @route   DELETE /api/admin/sessions/:sessionId
 * @desc    Delete session
 * @access  Private (Admin only)
 */
router.delete('/sessions/:sessionId', deleteSession);

// ==================== POLL MANAGEMENT ====================

/**
 * @route   GET /api/admin/polls
 * @desc    Get all polls with pagination and filters
 * @access  Private (Admin only)
 */
router.get('/polls', getAllPolls);

/**
 * @route   DELETE /api/admin/polls/:pollId
 * @desc    Delete poll
 * @access  Private (Admin only)
 */
router.delete('/polls/:pollId', deletePoll);

export default router;
