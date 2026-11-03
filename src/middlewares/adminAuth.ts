import { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import User from '../models/user';

export interface AdminRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
  user?: any;
}

/**
 * Middleware to check if user is an admin
 * Must be used after clerkAuth middleware
 */
export const isAdmin = async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    console.log('🔐 Checking admin permissions for user:', userId);

    // Check user role in database
    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'admin') {
      console.log('❌ Access denied - User role:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    console.log('✅ Admin access granted');
    req.user = user;
    next();

  } catch (error: any) {
    console.error('❌ Admin auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      error: error.message
    });
  }
};

/**
 * Middleware to check if user is admin or tutor
 */
export const isAdminOrTutor = async (req: AdminRequest, res: Response, next:NextFunction) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!['admin', 'tutor'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or tutor privileges required.'
      });
    }

    req.user = user;
    next();

  } catch (error: any) {
    console.error('❌ Auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      error: error.message
    });
  }
};
