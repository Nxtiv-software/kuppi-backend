import { Request, Response } from 'express';
import mongoose from 'mongoose';
import UserNotification from '../models/UserNotification';
import { AuthenticatedRequest } from '../middlewares/clerkAuth';

const parsePositiveNumber = (value: unknown, fallback: number) => {
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const page = parsePositiveNumber(req.query.page, 1);
    const limit = Math.min(parsePositiveNumber(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;
    const status = String(req.query.status || 'all');

    const query: any = { userId };
    if (status !== 'all') {
      query.status = status;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      UserNotification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      UserNotification.countDocuments(query),
      UserNotification.countDocuments({ userId, status: 'unread' })
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching user notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
  }
};

export const markMyNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notification = await UserNotification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { status: 'read', readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification marked as read', data: notification });
  } catch (error: any) {
    console.error('❌ Error marking user notification as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read', error: error.message });
  }
};

export const markAllMyNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await UserNotification.updateMany(
      { userId, status: 'unread' },
      { $set: { status: 'read', readAt: new Date() } }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error: any) {
    console.error('❌ Error marking all user notifications as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read', error: error.message });
  }
};

export const deleteMyReadNotification = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const deletedNotification = await UserNotification.findOneAndDelete({
      _id: notificationId,
      userId,
      status: 'read'
    });

    if (!deletedNotification) {
      const existingNotification = await UserNotification.findOne({ _id: notificationId, userId });
      if (existingNotification && existingNotification.status !== 'read') {
        return res.status(400).json({ success: false, message: 'Only read notifications can be deleted' });
      }
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Read notification deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error deleting read user notification:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification', error: error.message });
  }
};

export const deleteAllMyReadNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await UserNotification.deleteMany({ userId, status: 'read' });

    res.json({
      success: true,
      message: 'Read notifications deleted successfully',
      data: { deletedCount: result.deletedCount || 0 }
    });
  } catch (error: any) {
    console.error('❌ Error deleting all read user notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to delete read notifications', error: error.message });
  }
};
