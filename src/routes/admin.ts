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
  cancelSession,
  forceEndSession,
  getAllPolls,
  deletePoll,
  updatePollStatus,
  forceClosePoll,
  getSystemAnalytics
} from '../controllers/adminController';
import {
  getAdminNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../controllers/adminNotificationController';

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

/**
 * @route   PATCH /api/admin/sessions/:sessionId/cancel
 * @desc    Cancel a session with reason
 * @access  Private (Admin only)
 */
router.patch('/sessions/:sessionId/cancel', cancelSession);

/**
 * @route   PATCH /api/admin/sessions/:sessionId/force-end
 * @desc    Force end an ongoing session
 * @access  Private (Admin only)
 */
router.patch('/sessions/:sessionId/force-end', forceEndSession);

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

/**
 * @route   PATCH /api/admin/polls/:pollId/status
 * @desc    Update poll status (accept/reject)
 * @access  Private (Admin only)
 */
router.patch('/polls/:pollId/status', updatePollStatus);

/**
 * @route   PATCH /api/admin/polls/:pollId/force-close
 * @desc    Force close an active poll
 * @access  Private (Admin only)
 */
router.patch('/polls/:pollId/force-close', forceClosePoll);

// ==================== NOTIFICATION MANAGEMENT ====================

/**
 * @route   GET /api/admin/notifications
 * @desc    Get admin notifications with pagination and filters
 * @access  Private (Admin only)
 */
router.get('/notifications', getAdminNotifications);

/**
 * @route   GET /api/admin/notifications/unread-count
 * @desc    Get unread admin notification count
 * @access  Private (Admin only)
 */
router.get('/notifications/unread-count', getUnreadNotificationCount);

/**
 * @route   PATCH /api/admin/notifications/:notificationId/read
 * @desc    Mark single notification as read
 * @access  Private (Admin only)
 */
router.patch('/notifications/:notificationId/read', markNotificationAsRead);

/**
 * @route   PATCH /api/admin/notifications/mark-all-read
 * @desc    Mark all unread notifications as read
 * @access  Private (Admin only)
 */
router.patch('/notifications/mark-all-read', markAllNotificationsAsRead);

export default router;
