import { Response } from 'express';
import mongoose from 'mongoose';
import AdminNotification from '../models/AdminNotification';
import { AdminRequest } from '../middlewares/adminAuth';

const parsePositiveNumber = (value: any, fallback: number) => {
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

export const getAdminNotifications = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const page = parsePositiveNumber(req.query.page, 1);
    const limit = Math.min(parsePositiveNumber(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const status = String(req.query.status || 'all');
    const category = String(req.query.category || 'all');
    const severity = String(req.query.severity || 'all');

    const query: any = { adminId };

    if (status !== 'all') {
      query.status = status;
    }

    if (category !== 'all') {
      query.category = category;
    }

    if (severity !== 'all') {
      query.severity = severity;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      AdminNotification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdminNotification.countDocuments(query),
      AdminNotification.countDocuments({ adminId, status: 'unread' })
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
    console.error('❌ Error fetching admin notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

export const getUnreadNotificationCount = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const unreadCount = await AdminNotification.countDocuments({
      adminId,
      status: 'unread'
    });

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching unread notification count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread notification count',
      error: error.message
    });
  }
};

export const markNotificationAsRead = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;
    const { notificationId } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    const notification = await AdminNotification.findOneAndUpdate(
      { _id: notificationId, adminId },
      {
        $set: {
          status: 'read',
          readAt: new Date()
        }
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error: any) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

export const markAllNotificationsAsRead = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await AdminNotification.updateMany(
      {
        adminId,
        status: 'unread'
      },
      {
        $set: {
          status: 'read',
          readAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error: any) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
};

export const deleteAdminNotification = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;
    const { notificationId } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    const notification = await AdminNotification.findOneAndDelete({ _id: notificationId, adminId });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('❌ Error deleting admin notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

export const deleteAllReadAdminNotifications = async (req: AdminRequest, res: Response) => {
  try {
    const adminId = req.auth?.userId;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await AdminNotification.deleteMany({
      adminId,
      status: 'read'
    });

    res.json({
      success: true,
      message: 'Read notifications deleted successfully',
      data: {
        deletedCount: result.deletedCount || 0
      }
    });
  } catch (error: any) {
    console.error('❌ Error deleting read admin notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete read notifications',
      error: error.message
    });
  }
};
