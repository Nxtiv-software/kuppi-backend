import { Request, Response } from 'express';
import User from '../models/user';
import AppSettings from '../models/AppSettings';
import { AuthenticatedRequest } from '../middlewares/clerkAuth';

type UserRole = 'student' | 'tutor' | 'admin';

const validLanguages = ['en', 'si'];
const validThemes = ['light', 'dark', 'system'];
const validProfileVisibility = ['public', 'private'];
const validContactMethods = ['email', 'phone', 'none'];
const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const isValidEmail = (value: string): boolean => /.+@.+\..+/.test(value);

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  return null;
};

const getOrCreateAppSettings = async () => {
  let settings = await AppSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await AppSettings.create({ key: 'default' });
  }
  return settings;
};

export const getMySettings = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;

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

    return res.json({
      success: true,
      data: {
        role: user.role,
        settings: {
          ...(user.dashboardSettings || {}),
          preferredContactMethod: (user as any).preferredContactMethod || 'email'
        }
      }
    });
  } catch (error: any) {
    console.error('Failed to get user settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
};

export const updateMySettings = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).auth?.userId;

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

    const payload = req.body || {};
    const errors: string[] = [];

    const userDoc = user as any;
    const dashboardSettings = {
      timezone: userDoc.dashboardSettings?.timezone || 'Asia/Colombo',
      language: userDoc.dashboardSettings?.language || 'en',
      theme: userDoc.dashboardSettings?.theme || 'system',
      notifications: {
        email: userDoc.dashboardSettings?.notifications?.email ?? true,
        push: userDoc.dashboardSettings?.notifications?.push ?? true,
        reminders: userDoc.dashboardSettings?.notifications?.reminders ?? true
      },
      preferredContactMethod: userDoc.preferredContactMethod || 'email',
      tutor: {
        subjects: userDoc.dashboardSettings?.tutor?.subjects || [],
        availability: userDoc.dashboardSettings?.tutor?.availability || [],
        profileVisibility: userDoc.dashboardSettings?.tutor?.profileVisibility || 'public',
        sessionPrice: userDoc.dashboardSettings?.tutor?.sessionPrice ?? 0
      },
      student: {
        defaultReminderOffsetMinutes: userDoc.dashboardSettings?.student?.defaultReminderOffsetMinutes ?? 1440,
        learningGoals: userDoc.dashboardSettings?.student?.learningGoals || []
      }
    };

    if (payload.timezone !== undefined) {
      if (typeof payload.timezone !== 'string' || payload.timezone.trim().length === 0) {
        errors.push('timezone must be a non-empty string');
      } else {
        dashboardSettings.timezone = payload.timezone.trim();
      }
    }

    if (payload.language !== undefined) {
      if (!validLanguages.includes(payload.language)) {
        errors.push('language must be one of: en, si');
      } else {
        dashboardSettings.language = payload.language;
      }
    }

    if (payload.theme !== undefined) {
      if (!validThemes.includes(payload.theme)) {
        errors.push('theme must be one of: light, dark, system');
      } else {
        dashboardSettings.theme = payload.theme;
      }
    }

    if (payload.notifications !== undefined) {
      if (typeof payload.notifications !== 'object' || payload.notifications === null) {
        errors.push('notifications must be an object');
      } else {
        if (payload.notifications.email !== undefined) {
          const email = parseBoolean(payload.notifications.email);
          if (email === null) {
            errors.push('notifications.email must be boolean');
          } else {
            dashboardSettings.notifications.email = email;
          }
        }

        if (payload.notifications.push !== undefined) {
          const push = parseBoolean(payload.notifications.push);
          if (push === null) {
            errors.push('notifications.push must be boolean');
          } else {
            dashboardSettings.notifications.push = push;
          }
        }

        if (payload.notifications.reminders !== undefined) {
          const reminders = parseBoolean(payload.notifications.reminders);
          if (reminders === null) {
            errors.push('notifications.reminders must be boolean');
          } else {
            dashboardSettings.notifications.reminders = reminders;
          }
        }
      }
    }

    if (payload.preferredContactMethod !== undefined) {
      if (!validContactMethods.includes(payload.preferredContactMethod)) {
        errors.push('preferredContactMethod must be one of: email, phone, none');
      } else {
        userDoc.preferredContactMethod = payload.preferredContactMethod;
      }
    }

    if ((user.role as UserRole) === 'tutor' && payload.tutor !== undefined) {
      if (typeof payload.tutor !== 'object' || payload.tutor === null) {
        errors.push('tutor must be an object');
      } else {
        if (payload.tutor.subjects !== undefined) {
          if (!Array.isArray(payload.tutor.subjects) || payload.tutor.subjects.some((item: any) => typeof item !== 'string')) {
            errors.push('tutor.subjects must be an array of strings');
          } else {
            dashboardSettings.tutor.subjects = payload.tutor.subjects.map((item: string) => item.trim()).filter(Boolean);
          }
        }

        if (payload.tutor.profileVisibility !== undefined) {
          if (!validProfileVisibility.includes(payload.tutor.profileVisibility)) {
            errors.push('tutor.profileVisibility must be one of: public, private');
          } else {
            dashboardSettings.tutor.profileVisibility = payload.tutor.profileVisibility;
          }
        }

        if (payload.tutor.sessionPrice !== undefined) {
          const price = Number(payload.tutor.sessionPrice);
          if (Number.isNaN(price) || price < 0 || price > 100000) {
            errors.push('tutor.sessionPrice must be a positive number');
          } else {
            dashboardSettings.tutor.sessionPrice = price;
          }
        }

        if (payload.tutor.availability !== undefined) {
          if (!Array.isArray(payload.tutor.availability)) {
            errors.push('tutor.availability must be an array');
          } else {
            const normalizedAvailability = payload.tutor.availability.map((slot: any) => ({
              day: typeof slot?.day === 'string' ? slot.day.toLowerCase() : '',
              start: typeof slot?.start === 'string' ? slot.start : '',
              end: typeof slot?.end === 'string' ? slot.end : ''
            }));

            const invalidSlot = normalizedAvailability.find(
              (slot: any) => !validDays.includes(slot.day) || !slot.start || !slot.end
            );

            if (invalidSlot) {
              errors.push('each tutor availability slot must have valid day, start, and end');
            } else {
              dashboardSettings.tutor.availability = normalizedAvailability;
            }
          }
        }
      }
    }

    if ((user.role as UserRole) === 'student' && payload.student !== undefined) {
      if (typeof payload.student !== 'object' || payload.student === null) {
        errors.push('student must be an object');
      } else {
        if (payload.student.defaultReminderOffsetMinutes !== undefined) {
          const offset = Number(payload.student.defaultReminderOffsetMinutes);
          if (Number.isNaN(offset) || offset < 0 || offset > 10080) {
            errors.push('student.defaultReminderOffsetMinutes must be between 0 and 10080');
          } else {
            dashboardSettings.student.defaultReminderOffsetMinutes = offset;
          }
        }

        if (payload.student.learningGoals !== undefined) {
          if (!Array.isArray(payload.student.learningGoals) || payload.student.learningGoals.some((g: any) => typeof g !== 'string')) {
            errors.push('student.learningGoals must be an array of strings');
          } else {
            dashboardSettings.student.learningGoals = payload.student.learningGoals.map((g: string) => g.trim()).filter(Boolean);
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    userDoc.dashboardSettings = dashboardSettings;
    await userDoc.save();

    return res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        role: user.role,
        settings: {
          ...userDoc.dashboardSettings,
          preferredContactMethod: userDoc.preferredContactMethod || 'email'
        }
      }
    });
  } catch (error: any) {
    console.error('Failed to update user settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
};

export const getAppSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateAppSettings();

    return res.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    console.error('Failed to get app settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch app settings',
      error: error.message
    });
  }
};

export const getPublicAppSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateAppSettings();

    return res.json({
      success: true,
      data: {
        siteName: settings.siteName,
        maintenanceMode: settings.maintenanceMode,
        defaultTimezone: settings.defaultTimezone,
        defaultLanguage: settings.defaultLanguage
      }
    });
  } catch (error: any) {
    console.error('Failed to get public app settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch public app settings',
      error: error.message
    });
  }
};

export const updateAppSettings = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const errors: string[] = [];

    const settings = await getOrCreateAppSettings();
    const settingsDoc = settings as any;

    if (payload.siteName !== undefined) {
      if (typeof payload.siteName !== 'string' || !payload.siteName.trim()) {
        errors.push('siteName must be a non-empty string');
      } else {
        settingsDoc.siteName = payload.siteName.trim();
      }
    }

    if (payload.logoUrl !== undefined) {
      if (typeof payload.logoUrl !== 'string') {
        errors.push('logoUrl must be a string');
      } else {
        settingsDoc.logoUrl = payload.logoUrl.trim();
      }
    }

    if (payload.defaultTimezone !== undefined) {
      if (typeof payload.defaultTimezone !== 'string' || !payload.defaultTimezone.trim()) {
        errors.push('defaultTimezone must be a non-empty string');
      } else {
        settingsDoc.defaultTimezone = payload.defaultTimezone.trim();
      }
    }

    if (payload.defaultLanguage !== undefined) {
      if (!validLanguages.includes(payload.defaultLanguage)) {
        errors.push('defaultLanguage must be one of: en, si');
      } else {
        settingsDoc.defaultLanguage = payload.defaultLanguage;
      }
    }

    if (payload.emailFromName !== undefined) {
      if (typeof payload.emailFromName !== 'string' || !payload.emailFromName.trim()) {
        errors.push('emailFromName must be a non-empty string');
      } else {
        settingsDoc.emailFromName = payload.emailFromName.trim();
      }
    }

    if (payload.emailFromAddress !== undefined) {
      if (typeof payload.emailFromAddress !== 'string' || !isValidEmail(payload.emailFromAddress)) {
        errors.push('emailFromAddress must be a valid email address');
      } else {
        settingsDoc.emailFromAddress = payload.emailFromAddress.trim();
      }
    }

    if (payload.maintenanceMode !== undefined) {
      const maintenanceMode = parseBoolean(payload.maintenanceMode);
      if (maintenanceMode === null) {
        errors.push('maintenanceMode must be boolean');
      } else {
        settingsDoc.maintenanceMode = maintenanceMode;
      }
    }

    if (payload.notifications !== undefined) {
      if (typeof payload.notifications !== 'object' || payload.notifications === null) {
        errors.push('notifications must be an object');
      } else if (payload.notifications.systemEmailEnabled !== undefined) {
        const systemEmailEnabled = parseBoolean(payload.notifications.systemEmailEnabled);
        if (systemEmailEnabled === null) {
          errors.push('notifications.systemEmailEnabled must be boolean');
        } else {
          settingsDoc.notifications = settingsDoc.notifications || {};
          settingsDoc.notifications.systemEmailEnabled = systemEmailEnabled;
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    await settingsDoc.save();

    return res.json({
      success: true,
      message: 'App settings updated successfully',
      data: settingsDoc
    });
  } catch (error: any) {
    console.error('Failed to update app settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update app settings',
      error: error.message
    });
  }
};
