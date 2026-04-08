import { Response } from 'express';
import { AdminRequest } from '../middlewares/adminAuth';
import NotificationCampaign from '../models/NotificationCampaign';
import ReminderRule from '../models/ReminderRule';
import ReminderRunLog from '../models/ReminderRunLog';
import { CreateCommunicationCampaignRequest, CreateReminderRuleRequest } from '../types/communication';
import {
  createReminderRule,
  listCampaigns,
  listReminderLogs,
  listReminderRules,
  runReminderRule,
  sendCampaignToAudience
} from '../services/communicationService';

const parsePositiveNumber = (value: unknown, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
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

    const reminder = await createReminderRule({
      name,
      description,
      triggerLabel,
      audience: body.audience || 'students',
      channel: body.channel || 'email',
      scheduleType: body.scheduleType || 'one_time',
      scheduledFor: body.scheduledFor,
      repeatEveryMinutes: body.repeatEveryMinutes,
      templateSubject,
      templateMessage,
      actionUrl: body.actionUrl,
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
    const reminder = await ReminderRule.findByIdAndUpdate(reminderId, req.body, { new: true });

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
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ReminderRunLog.find({ ruleId: reminderId }).sort({ runAt: -1 }).skip(skip).limit(limit),
      ReminderRunLog.countDocuments({ ruleId: reminderId })
    ]);

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
