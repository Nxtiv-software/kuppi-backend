// tests/settings.test.ts
import { getMySettings, updateMySettings, getAppSettings, updateAppSettings } from '../src/controllers/settingsController';
import User from '../src/models/user';
import AppSettings from '../src/models/AppSettings';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../src/middlewares/clerkAuth';

// Mock the models
jest.mock('../src/models/user');
jest.mock('../src/models/AppSettings');

const mockRequest = (data: any = {}): Partial<AuthenticatedRequest> => ({
  body: data,
  auth: { userId: 'test-clerk-id' } as any
});

const mockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Settings Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMySettings', () => {
    it('should return 401 if user not authenticated', async () => {
      const req = { auth: undefined } as any;
      const res = mockResponse();

      await getMySettings(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 if user not found', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);
      
      const req = mockRequest();
      const res = mockResponse();

      await getMySettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return user settings successfully', async () => {
      const mockUser: any = {
        _id: 'user-id',
        clerkId: 'test-clerk-id',
        role: 'student',
        dashboardSettings: {
          timezone: 'Asia/Colombo',
          language: 'en',
          theme: 'system',
          notifications: {
            email: true,
            push: true,
            reminders: true
          },
          preferredContactMethod: 'email',
          student: {
            defaultReminderOffsetMinutes: 1440,
            learningGoals: []
          }
        }
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest();
      const res = mockResponse();

      await getMySettings(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          role: 'student',
          settings: expect.objectContaining({
            timezone: 'Asia/Colombo',
            language: 'en',
            preferredContactMethod: 'email'
          })
        }
      });
    });
  });

  describe('updateMySettings', () => {
    it('should validate timezone as non-empty string', async () => {
      const mockUser: any = {
        clerkId: 'test-clerk-id',
        role: 'student',
        dashboardSettings: {},
        save: jest.fn()
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest({ timezone: '' });
      const res = mockResponse();

      await updateMySettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('timezone must be a non-empty string')
          ])
        })
      );
    });

    it('should validate language enum', async () => {
      const mockUser = {
        clerkId: 'test-clerk-id',
        role: 'student',
        dashboardSettings: {},
        save: jest.fn()
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest({ language: 'invalid' });
      const res = mockResponse();

      await updateMySettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('language must be one of')
          ])
        })
      );
    });

    it('should update student learning goals', async () => {
      const mockUser: any = {
        clerkId: 'test-clerk-id',
        role: 'student',
        dashboardSettings: {
          timezone: 'Asia/Colombo',
          language: 'en',
          theme: 'system',
          notifications: { email: true, push: true, reminders: true },
          student: { defaultReminderOffsetMinutes: 1440, learningGoals: [] }
        },
        preferredContactMethod: 'email',
          save: jest.fn()
      };
        mockUser.save.mockResolvedValue(mockUser);

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest({
        student: {
          learningGoals: ['Learn Calculus', 'Master Algebra']
        }
      });
      const res = mockResponse();

      await updateMySettings(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Settings updated successfully'
        })
      );
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should validate tutor session price', async () => {
      const mockUser: any = {
        clerkId: 'test-clerk-id',
        role: 'tutor',
        dashboardSettings: {
          tutor: { subjects: [], availability: [], profileVisibility: 'public', sessionPrice: 0 }
        },
        save: jest.fn()
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest({
        tutor: { sessionPrice: -50 }
      });
      const res = mockResponse();

      await updateMySettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('sessionPrice must be a positive number')
          ])
        })
      );
    });

    it('should accept valid tutor session price', async () => {
      const mockUser: any = {
        clerkId: 'test-clerk-id',
        role: 'tutor',
        dashboardSettings: {
          timezone: 'Asia/Colombo',
          language: 'en',
          theme: 'system',
          notifications: { email: true, push: true, reminders: true },
          preferredContactMethod: 'email',
          tutor: { subjects: [], availability: [], profileVisibility: 'public', sessionPrice: 0 }
        },
          save: jest.fn()
      };
        mockUser.save.mockResolvedValue(mockUser);

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const req = mockRequest({
        tutor: { sessionPrice: 50.5 }
      });
      const res = mockResponse();

      await updateMySettings(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Settings updated successfully'
        })
      );
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('getAppSettings', () => {
    it('should create default app settings if not found', async () => {
      const mockSettings: any = {
        key: 'default',
        siteName: 'Kuppi.lk',
        defaultTimezone: 'Asia/Colombo',
        defaultLanguage: 'en'
      };

      (AppSettings.findOne as jest.Mock).mockResolvedValue(null);
      (AppSettings.create as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest();
      const res = mockResponse();

      await getAppSettings(req as Request, res as Response);

      expect(AppSettings.findOne).toHaveBeenCalledWith({ key: 'default' });
      expect(AppSettings.create).toHaveBeenCalledWith({ key: 'default' });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSettings
      });
    });

    it('should return existing app settings', async () => {
      const mockSettings: any = {
        key: 'default',
        siteName: 'Kuppi.lk',
        defaultTimezone: 'Asia/Colombo',
        defaultLanguage: 'en',
        maintenanceMode: false
      };

      (AppSettings.findOne as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest();
      const res = mockResponse();

      await getAppSettings(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSettings
      });
    });
  });

  describe('updateAppSettings', () => {
    it('should validate siteName as non-empty string', async () => {
      const mockSettings: any = {
        key: 'default',
        siteName: 'Kuppi.lk',
        save: jest.fn()
      };

      (AppSettings.findOne as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest({ siteName: '' });
      const res = mockResponse();

      await updateAppSettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('siteName must be a non-empty string')
          ])
        })
      );
    });

    it('should validate email address format', async () => {
      const mockSettings: any = {
        key: 'default',
        emailFromAddress: 'support@kuppi.lk',
        save: jest.fn()
      };

      (AppSettings.findOne as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest({ emailFromAddress: 'invalid-email' });
      const res = mockResponse();

      await updateAppSettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('emailFromAddress must be a valid email')
          ])
        })
      );
    });

    it('should update app settings successfully', async () => {
      const mockSettings: any = {
        key: 'default',
        siteName: 'Kuppi.lk',
        logoUrl: '',
        defaultTimezone: 'Asia/Colombo',
        defaultLanguage: 'en',
        emailFromName: 'Kuppi',
        emailFromAddress: 'support@kuppi.lk',
        maintenanceMode: false,
        notifications: { systemEmailEnabled: true },
          save: jest.fn()
      };
        mockSettings.save.mockResolvedValue(mockSettings);

      (AppSettings.findOne as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest({
        siteName: 'My Academy',
        maintenanceMode: true
      });
      const res = mockResponse();

      await updateAppSettings(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'App settings updated successfully'
        })
      );
      expect(mockSettings.save).toHaveBeenCalled();
    });

    it('should validate maintenance mode as boolean', async () => {
      const mockSettings: any = {
        key: 'default',
        save: jest.fn()
      };

      (AppSettings.findOne as jest.Mock).mockResolvedValue(mockSettings);

      const req = mockRequest({ maintenanceMode: 'yes' });
      const res = mockResponse();

      await updateAppSettings(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.arrayContaining([
            expect.stringContaining('maintenanceMode must be boolean')
          ])
        })
      );
    });
  });
});
