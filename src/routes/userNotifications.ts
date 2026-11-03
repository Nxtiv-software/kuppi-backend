import express from 'express';
import { requireAuth } from '../middlewares/clerkAuth';
import {
  deleteAllMyReadNotifications,
  deleteMyReadNotification,
  getMyNotifications,
  markAllMyNotificationsAsRead,
  markMyNotificationAsRead
} from '../controllers/userNotificationController';

const router = express.Router();

router.use(requireAuth);

router.get('/my', getMyNotifications);
router.delete('/read', deleteAllMyReadNotifications);
router.patch('/:notificationId/read', markMyNotificationAsRead);
router.delete('/:notificationId', deleteMyReadNotification);
router.patch('/mark-all-read', markAllMyNotificationsAsRead);

export default router;