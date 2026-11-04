import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import AppSettings from '../models/AppSettings';
import User from '../models/user';

const MAINTENANCE_WHITELIST = ['/health', '/api/settings/public'];

const getAppSettingsSnapshot = async () => {
  let settings = await AppSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await AppSettings.create({ key: 'default' });
  }
  return settings;
};

export const maintenanceModeGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (MAINTENANCE_WHITELIST.some((path) => req.originalUrl.startsWith(path))) {
      return next();
    }

    const settings = await getAppSettingsSnapshot();
    if (!settings.maintenanceMode) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(503).json({
        success: false,
        maintenanceMode: true,
        siteName: settings.siteName,
        message: 'The platform is temporarily under maintenance. Please try again later.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token) as any;
    const clerkId = decoded?.sub;

    if (!clerkId) {
      return res.status(503).json({
        success: false,
        maintenanceMode: true,
        siteName: settings.siteName,
        message: 'The platform is temporarily under maintenance. Please try again later.'
      });
    }

    const user = await User.findOne({ clerkId });
    if (user?.role === 'admin') {
      return next();
    }

    return res.status(503).json({
      success: false,
      maintenanceMode: true,
      siteName: settings.siteName,
      message: 'The platform is temporarily under maintenance. Please try again later.'
    });
  } catch (error) {
    console.error('Maintenance mode guard error:', error);
    return next();
  }
};