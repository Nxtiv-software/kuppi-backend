import User from '../models/user';
import Session from '../models/Session';
import { sendEmail } from './emailService';
import NotificationCampaign, { INotificationCampaign } from '../models/NotificationCampaign';
import ReminderRule, { IReminderRule } from '../models/ReminderRule';
import ReminderRunLog from '../models/ReminderRunLog';
import UserNotification from '../models/UserNotification';
import { CommunicationAudience } from '../types/communication';

const BATCH_SIZE = 40;

const dedupeEmails = (emails: string[]) => Array.from(new Set(
  emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
));

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getEmailsByRole = async (role?: 'student' | 'tutor' | 'admin'): Promise<string[]> => {
  const query: any = { email: { $exists: true, $ne: '' } };
  if (role) {
    query.role = role;
  }

  const users = await User.find(query).select('email preferences.notifications.email');
  return dedupeEmails(
    users
      .filter((user: any) => user.preferences?.notifications?.email !== false)
      .map((user: any) => user.email)
  );
};

const getAudienceUsers = async (
  audience: CommunicationAudience,
  customRecipientEmails: string[] = []
): Promise<Array<{ userId: string; email: string; role: string }>> => {
  const query: any = {
    clerkId: { $exists: true, $ne: null },
    email: { $exists: true, $ne: '' }
  };

  if (audience === 'students') query.role = 'student';
  if (audience === 'tutors') query.role = 'tutor';
  if (audience === 'admins') query.role = 'admin';
  if (audience === 'custom') query.email = { $in: dedupeEmails(customRecipientEmails) };

  const users = await User.find(query).select('clerkId email role preferences.notifications.push').lean();

  const dedupe = new Map<string, { userId: string; email: string; role: string }>();
  for (const user of users as any[]) {
    const userId = String(user.clerkId || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const role = String(user.role || 'student').trim();
    const pushEnabled = user?.preferences?.notifications?.push !== false;

    if (!pushEnabled || !userId || !email) continue;
    if (!dedupe.has(userId)) {
      dedupe.set(userId, { userId, email, role });
    }
  }

  return Array.from(dedupe.values());
};

export const getAudienceEmails = async (
  audience: CommunicationAudience,
  customRecipientEmails: string[] = []
): Promise<string[]> => {
  switch (audience) {
    case 'students':
      return getEmailsByRole('student');
    case 'tutors':
      return getEmailsByRole('tutor');
    case 'admins':
      return getEmailsByRole('admin');
    case 'custom':
      return dedupeEmails(customRecipientEmails);
    case 'all':
    default: {
      const [students, tutors, admins] = await Promise.all([
        getEmailsByRole('student'),
        getEmailsByRole('tutor'),
        getEmailsByRole('admin')
      ]);
      return dedupeEmails([...students, ...tutors, ...admins]);
    }
  }
};

const buildEmailHtml = (title: string, message: string, actionUrl?: string) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="padding: 28px; background: linear-gradient(135deg, #111827 0%, #1d4ed8 100%); color: #fff;">
          <h1 style="margin: 0; font-size: 24px;">${title}</h1>
        </div>
        <div style="padding: 28px;">
          <p style="margin-top: 0; white-space: pre-line;">${message}</p>
          ${actionUrl ? `<p><a href="${actionUrl}" style="display:inline-block;margin-top:16px;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;">Open</a></p>` : ''}
        </div>
      </div>
    </body>
  </html>
`;

export const sendCampaignToAudience = async (input: {
  title: string;
  message: string;
  audience: CommunicationAudience;
  actionUrl?: string;
  customRecipientEmails?: string[];
  createdBy?: string;
}) => {
  const recipients = await getAudienceEmails(input.audience, input.customRecipientEmails || []);
  const audienceUsers = await getAudienceUsers(input.audience, input.customRecipientEmails || []);

  const campaign = await NotificationCampaign.create({
    title: input.title,
    message: input.message,
    audience: input.audience,
    channel: 'email',
    status: recipients.length > 0 ? 'sending' : 'failed',
    recipientCount: recipients.length,
    deliveredCount: 0,
    failedCount: 0,
    openedCount: 0,
    actionUrl: input.actionUrl,
    customRecipientEmails: input.customRecipientEmails || [],
    createdBy: input.createdBy,
    metadata: {}
  });

  if (recipients.length === 0) {
    await NotificationCampaign.findByIdAndUpdate(campaign._id, {
      status: 'failed',
      failedCount: 0,
      sentAt: new Date()
    });
    return {
      campaign,
      recipients,
      audienceUsers,
      deliveredCount: 0,
      failedCount: 0
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const html = buildEmailHtml(input.title, input.message, input.actionUrl);

  for (const batch of chunk(recipients, BATCH_SIZE)) {
    const success = await sendEmail({
      to: batch,
      subject: input.title,
      html
    });

    if (success) {
      deliveredCount += batch.length;
    } else {
      failedCount += batch.length;
    }
  }

  await NotificationCampaign.findByIdAndUpdate(campaign._id, {
    status: failedCount === 0 ? 'sent' : deliveredCount > 0 ? 'sent' : 'failed',
    deliveredCount,
    failedCount,
    openedCount: 0,
    sentAt: new Date(),
    metadata: {
      deliveredRecipients: deliveredCount,
      failedRecipients: failedCount
    }
  });

  if (audienceUsers.length > 0) {
    await UserNotification.insertMany(
      audienceUsers.map((user) => ({
        userId: user.userId,
        email: user.email,
        role: user.role,
        title: input.title,
        message: input.message,
        audience: input.audience,
        channel: 'in_app',
        status: 'unread',
        actionUrl: input.actionUrl,
        campaignId: String(campaign._id),
        metadata: {
          createdBy: input.createdBy || null,
          recipientEmail: user.email
        }
      })),
      { ordered: false }
    );
  }

  return {
    campaign: await NotificationCampaign.findById(campaign._id),
    recipients,
    audienceUsers,
    deliveredCount,
    failedCount
  };
};

export const createReminderRule = async (input: {
  name: string;
  description: string;
  triggerLabel: string;
  audience: CommunicationAudience;
  channel?: 'email';
  scheduleType?: 'one_time' | 'recurring';
  scheduledFor?: string;
  repeatEveryMinutes?: number;
  templateSubject?: string;
  templateMessage?: string;
  actionUrl?: string;
  createdBy?: string;
}) => {
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const rule = await ReminderRule.create({
    name: input.name,
    description: input.description,
    triggerLabel: input.triggerLabel,
    audience: input.audience,
    channel: 'email',
    scheduleType: input.scheduleType || 'one_time',
    scheduledFor,
    repeatEveryMinutes: input.repeatEveryMinutes || null,
    templateSubject: input.templateSubject || input.name,
    templateMessage: input.templateMessage || input.description,
    actionUrl: input.actionUrl,
    status: 'active',
    nextRunAt: scheduledFor || new Date(),
    lastRunAt: null,
    runCount: 0,
    createdBy: input.createdBy,
    metadata: {}
  });

  return rule;
};

export const runReminderRule = async (ruleId: string, options?: { force?: boolean }) => {
  const rule = await ReminderRule.findById(ruleId);

  if (!rule) {
    throw new Error('Reminder rule not found');
  }

  if (rule.status !== 'active' && !options?.force) {
    throw new Error('Reminder rule is paused or completed');
  }

  const recipients = await getAudienceEmails(rule.audience);
  const html = buildEmailHtml(rule.templateSubject, rule.templateMessage, rule.actionUrl);

  let deliveredCount = 0;
  let failedCount = 0;

  for (const batch of chunk(recipients, BATCH_SIZE)) {
    const success = await sendEmail({
      to: batch,
      subject: rule.templateSubject,
      html
    });

    if (success) {
      deliveredCount += batch.length;
    } else {
      failedCount += batch.length;
    }
  }

  const now = new Date();
  const repeatEveryMinutes = Number(rule.repeatEveryMinutes || 0);
  const isRecurring = rule.scheduleType === 'recurring' && repeatEveryMinutes > 0;
  const nextRunAt = isRecurring ? new Date(now.getTime() + repeatEveryMinutes * 60 * 1000) : null;

  if (!isRecurring) {
    rule.status = 'completed';
  }

  rule.lastRunAt = now;
  rule.nextRunAt = nextRunAt;
  rule.runCount = (rule.runCount || 0) + 1;
  await rule.save();

  const log = await ReminderRunLog.create({
    ruleId: rule._id,
    status: failedCount === 0 ? 'success' : deliveredCount > 0 ? 'success' : 'failed',
    recipientsCount: recipients.length,
    deliveredCount,
    failedCount,
    error: failedCount > 0 && deliveredCount === 0 ? 'One or more email batches failed' : null,
    notes: isRecurring ? `Next run scheduled for ${nextRunAt?.toISOString()}` : 'One-time reminder executed',
    metadata: {
      audience: rule.audience,
      scheduleType: rule.scheduleType
    },
    runAt: now
  });

  return {
    rule,
    log,
    recipients,
    deliveredCount,
    failedCount
  };
};

export const processDueReminderRules = async () => {
  const now = new Date();
  const dueRules = await ReminderRule.find({
    status: 'active',
    nextRunAt: { $lte: now }
  }).limit(25);

  const results = [];
  for (const rule of dueRules) {
    try {
      const result = await runReminderRule(String(rule._id), { force: true });
      results.push(result);
    } catch (error: any) {
      await ReminderRunLog.create({
        ruleId: rule._id,
        status: 'failed',
        recipientsCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        error: error.message,
        notes: 'Scheduled reminder execution failed',
        metadata: { ruleName: rule.name },
        runAt: new Date()
      });
    }
  }

  return results;
};

let reminderSchedulerStarted = false;
let reminderSchedulerHandle: NodeJS.Timeout | null = null;

export const startReminderScheduler = () => {
  if (reminderSchedulerStarted) {
    return;
  }

  reminderSchedulerStarted = true;
  reminderSchedulerHandle = setInterval(() => {
    processDueReminderRules().catch((error) => {
      console.error('❌ Reminder scheduler error:', error);
    });
  }, 60 * 1000);
};

export const stopReminderScheduler = () => {
  if (reminderSchedulerHandle) {
    clearInterval(reminderSchedulerHandle);
    reminderSchedulerHandle = null;
  }
  reminderSchedulerStarted = false;
};

export const listCampaigns = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [campaigns, total] = await Promise.all([
    NotificationCampaign.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    NotificationCampaign.countDocuments()
  ]);

  return {
    campaigns,
    total
  };
};

export const listReminderRules = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [rules, total] = await Promise.all([
    ReminderRule.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReminderRule.countDocuments()
  ]);

  return {
    rules,
    total
  };
};

export const listReminderLogs = async (ruleId: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    ReminderRunLog.find({ ruleId }).sort({ runAt: -1 }).skip(skip).limit(limit),
    ReminderRunLog.countDocuments({ ruleId })
  ]);

  return {
    logs,
    total
  };
};
