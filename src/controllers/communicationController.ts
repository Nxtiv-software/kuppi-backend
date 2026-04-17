import { Response } from 'express';
import mongoose from 'mongoose';
import { AdminRequest } from '../middlewares/adminAuth';
import NotificationCampaign from '../models/NotificationCampaign';
import ReminderRule from '../models/ReminderRule';
import ReminderRunLog from '../models/ReminderRunLog';
import UserNotification from '../models/UserNotification';
import { CreateCommunicationCampaignRequest, CreateReminderRuleRequest } from '../types/communication';
import {
  createReminderRule,
  getReminderAnalytics,
  listCampaigns,
  listReminderLogs,
  listReminderRules,
  runReminderRule,
  sendCampaignToAudience
} from '../services/communicationService';
import { isSafeActionUrl } from '../utils/reminderPolicy';

const parsePositiveNumber = (value: unknown, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const isValidHHmm = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

const validateReminderPayload = (body: CreateReminderRuleRequest) => {
  const errors: string[] = [];

  const scheduleType = body.scheduleType || 'one_time';
  const offsetMinutes = Number(body.offsetMinutes ?? 15);
  const cooldownMinutes = Number(body.cooldownMinutes ?? 60);
  const maxSendsPerUser = Number(body.maxSendsPerUser ?? 1);

  if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 43200) {
    errors.push('offsetMinutes must be between 0 and 43200');
  }

  if (scheduleType === 'recurring') {
    const repeatEveryMinutes = Number(body.repeatEveryMinutes ?? 0);
    if (!Number.isFinite(repeatEveryMinutes) || repeatEveryMinutes < 1 || repeatEveryMinutes > 10080) {
      errors.push('repeatEveryMinutes must be between 1 and 10080 for recurring reminders');
    }
  }

  if (body.scheduledFor) {
    const scheduledDate = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      errors.push('scheduledFor must be a valid datetime');
    }
  }

  if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 10080) {
    errors.push('cooldownMinutes must be between 0 and 10080');
  }

  if (!Number.isFinite(maxSendsPerUser) || maxSendsPerUser < 1 || maxSendsPerUser > 1000) {
    errors.push('maxSendsPerUser must be between 1 and 1000');
  }

  if (body.quietHours) {
    const quietStart = String(body.quietHours.start || '').trim();
    const quietEnd = String(body.quietHours.end || '').trim();

    if (!isValidHHmm(quietStart) || !isValidHHmm(quietEnd)) {
      errors.push('quietHours.start and quietHours.end must be in HH:mm format');
    }
  }

  if (body.timezone && !String(body.timezone).trim()) {
    errors.push('timezone cannot be empty');
  }

  if (body.audience === 'custom') {
    errors.push('custom audience is not supported for reminder rules');
  }

  if (!isSafeActionUrl(body.actionUrl)) {
    errors.push('actionUrl must be either a relative path or an absolute http/https URL');
  }

  return errors;
};

export const getCampaigns = async (req: AdminRequest, res: Response) => {
  try {
    const page = parsePositiveNumber(req.query.page, 1);
    const limit = Math.min(parsePositiveNumber(req.query.limit, 20), 100);
    const { campaigns, total } = await listCampaigns(page, limit);

    res.json({
      success: true,
      data: {
        campaigns,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns', error: error.message });
  }
};

export const sendCampaign = async (req: AdminRequest, res: Response) => {
  try {
    const body = req.body as CreateCommunicationCampaignRequest;
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const result = await sendCampaignToAudience({
      title,
      message,
      audience: body.audience || 'all',
      actionUrl: body.actionUrl,
      customRecipientEmails: body.customRecipientEmails,
      createdBy: req.auth?.userId
    });

    res.status(201).json({
      success: true,
      message: 'Campaign sent successfully',
      data: result.campaign
    });
  } catch (error: any) {
    console.error('❌ Error sending campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to send campaign', error: error.message });
  }
};

export const deleteCampaign = async (req: AdminRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
    }

    const campaign = await NotificationCampaign.findByIdAndDelete(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    await UserNotification.deleteMany({ campaignId: String(campaignId) });

    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error deleting campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to delete campaign', error: error.message });
  }
};

export const deleteReminder = async (req: AdminRequest, res: Response) => {
  try {
    const { reminderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reminderId)) {
      return res.status(400).json({ success: false, message: 'Invalid reminder ID' });
    }

    const reminder = await ReminderRule.findByIdAndDelete(reminderId);
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    await Promise.all([
      ReminderRunLog.deleteMany({ ruleId: reminderId }),
      UserNotification.deleteMany({ 'metadata.reminderRuleId': reminderId })
    ]);

    res.json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error deleting reminder:', error);
    res.status(500).json({ success: false, message: 'Failed to delete reminder', error: error.message });
  }
};

export const getReminders = async (req: AdminRequest, res: Response) => {
  try {
    const page = parsePositiveNumber(req.query.page, 1);
    const limit = Math.min(parsePositiveNumber(req.query.limit, 20), 100);
    const { rules, total } = await listReminderRules(page, limit);

    res.json({
      success: true,
      data: {
        reminders: rules,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching reminders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reminders', error: error.message });
  }
};

export const createReminder = async (req: AdminRequest, res: Response) => {
  try {
    const body = req.body as CreateReminderRuleRequest;
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const triggerLabel = String(body.triggerLabel || '').trim();
    const templateSubject = String(body.templateSubject || name).trim();
    const templateMessage = String(body.templateMessage || description).trim();

    if (!name || !description || !triggerLabel || !templateSubject || !templateMessage) {
      return res.status(400).json({ success: false, message: 'Missing required reminder fields' });
    }

    const validationErrors = validateReminderPayload(body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reminder payload',
        errors: validationErrors
      });
    }

    const reminder = await createReminderRule({
      name,
      description,
      triggerLabel,
      triggerType: body.triggerType,
      timingMode: body.timingMode,
      offsetMinutes: body.offsetMinutes,
      audience: body.audience || 'students',
      channel: body.channel || 'email',
      scheduleType: body.scheduleType || 'one_time',
      scheduledFor: body.scheduledFor,
      repeatEveryMinutes: body.repeatEveryMinutes,
      templateSubject,
      templateMessage,
      actionUrl: body.actionUrl,
      timezone: body.timezone,
      quietHours: body.quietHours,
      cooldownMinutes: body.cooldownMinutes,
      maxSendsPerUser: body.maxSendsPerUser,
      createdBy: req.auth?.userId
    });

    res.status(201).json({ success: true, message: 'Reminder created successfully', data: reminder });
  } catch (error: any) {
    console.error('❌ Error creating reminder:', error);
    res.status(500).json({ success: false, message: 'Failed to create reminder', error: error.message });
  }
};

export const updateReminder = async (req: AdminRequest, res: Response) => {
  try {
    const { reminderId } = req.params;

    const payload = req.body as CreateReminderRuleRequest;
    const validationErrors = validateReminderPayload(payload);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reminder payload',
        errors: validationErrors
      });
    }

    const updateData: any = { ...payload };

    if (updateData.repeatEveryMinutes !== undefined) {
      updateData.repeatEveryMinutes = Number(updateData.repeatEveryMinutes);
    }

    if (updateData.offsetMinutes !== undefined) {
      updateData.offsetMinutes = Number(updateData.offsetMinutes);
    }

    if (updateData.cooldownMinutes !== undefined) {
      updateData.cooldownMinutes = Number(updateData.cooldownMinutes);
    }

    if (updateData.maxSendsPerUser !== undefined) {
      updateData.maxSendsPerUser = Number(updateData.maxSendsPerUser);
    }

    const reminder = await ReminderRule.findByIdAndUpdate(reminderId, updateData, { new: true });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    res.json({ success: true, message: 'Reminder updated successfully', data: reminder });
  } catch (error: any) {
    console.error('❌ Error updating reminder:', error);
    res.status(500).json({ success: false, message: 'Failed to update reminder', error: error.message });
  }
};

export const toggleReminderStatus = async (req: AdminRequest, res: Response) => {
  try {
    const { reminderId } = req.params;
    const reminder = await ReminderRule.findById(reminderId);

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    reminder.status = reminder.status === 'active' ? 'paused' : 'active';
    if (reminder.status === 'active' && !reminder.nextRunAt) {
      reminder.nextRunAt = new Date();
    }
    await reminder.save();

    res.json({ success: true, message: 'Reminder status updated successfully', data: reminder });
  } catch (error: any) {
    console.error('❌ Error toggling reminder status:', error);
    res.status(500).json({ success: false, message: 'Failed to update reminder status', error: error.message });
  }
};

export const runReminderNow = async (req: AdminRequest, res: Response) => {
  try {
    const { reminderId } = req.params;
    const result = await runReminderRule(reminderId, { force: true });

    res.json({
      success: true,
      message: 'Reminder executed successfully',
      data: {
        reminder: result.rule,
        runLog: result.log,
        deliveredCount: result.deliveredCount,
        failedCount: result.failedCount
      }
    });
  } catch (error: any) {
    console.error('❌ Error running reminder:', error);
    res.status(500).json({ success: false, message: 'Failed to run reminder', error: error.message });
  }
};

export const getReminderLogs = async (req: AdminRequest, res: Response) => {
  try {
    const { reminderId } = req.params;
    const page = parsePositiveNumber(req.query.page, 1);
    const limit = Math.min(parsePositiveNumber(req.query.limit, 10), 100);
    const { logs, total } = await listReminderLogs(reminderId, page, limit);

    res.json({
      success: true,
      data: {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching reminder logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reminder logs', error: error.message });
  }
};

export const getReminderAnalyticsSummary = async (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(parsePositiveNumber(req.query.days, 7), 90);
    const summary = await getReminderAnalytics(days);

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('❌ Error fetching reminder analytics summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reminder analytics summary', error: error.message });
  }
};
