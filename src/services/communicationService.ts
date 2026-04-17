import User from '../models/user';
import Session from '../models/Session';
import { randomUUID } from 'crypto';
import { sendEmail } from './emailService';
import NotificationCampaign, { INotificationCampaign } from '../models/NotificationCampaign';
import ReminderRule, { IReminderRule } from '../models/ReminderRule';
import ReminderRunLog from '../models/ReminderRunLog';
import UserNotification from '../models/UserNotification';
import { CommunicationAudience } from '../types/communication';
import { evaluateRecipientEligibility, summarizeSkipBreakdown } from '../utils/reminderPolicy';

const BATCH_SIZE = 40;
const REMINDER_EXECUTION_LOCK_MINUTES = 5;
const DEFAULT_TIME_ZONE = 'Asia/Colombo';

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

const getTimeZoneParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
};

const parseHHmm = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const isWithinQuietHours = (currentMinutes: number, startMinutes: number, endMinutes: number) => {
  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = getTimeZoneParts(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return (utcFromParts - date.getTime()) / 60000;
};

const createDateInTimeZone = (
  date: Date,
  timeZone: string,
  hour: number,
  minute: number,
  dayOffset = 0
) => {
  const parts = getTimeZoneParts(date, timeZone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, hour, minute, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(localDate, timeZone);
  return new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
};

const getNextQuietHoursEnd = (date: Date, timeZone: string, quietHours: { start: string; end: string }) => {
  const startMinutes = parseHHmm(quietHours.start);
  const endMinutes = parseHHmm(quietHours.end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return null;
  }

  const currentParts = getTimeZoneParts(date, timeZone);
  const currentMinutes = currentParts.hour * 60 + currentParts.minute;

  if (!isWithinQuietHours(currentMinutes, startMinutes, endMinutes)) {
    return null;
  }

  const endHour = Math.floor(endMinutes / 60);
  const endMinute = endMinutes % 60;

  if (startMinutes < endMinutes) {
    return createDateInTimeZone(date, timeZone, endHour, endMinute, 0);
  }

  if (currentMinutes >= startMinutes) {
    return createDateInTimeZone(date, timeZone, endHour, endMinute, 1);
  }

  return createDateInTimeZone(date, timeZone, endHour, endMinute, 0);
};

const acquireReminderExecutionLock = async (ruleId: string) => {
  const now = new Date();
  const lockToken = randomUUID();
  const lockUntil = new Date(now.getTime() + REMINDER_EXECUTION_LOCK_MINUTES * 60 * 1000);

  const lockedRule = await ReminderRule.findOneAndUpdate(
    {
      _id: ruleId,
      $or: [
        { 'metadata.executionLockUntil': { $exists: false } },
        { 'metadata.executionLockUntil': null },
        { 'metadata.executionLockUntil': { $lte: now } }
      ]
    },
    {
      $set: {
        'metadata.executionLockUntil': lockUntil,
        'metadata.executionLockToken': lockToken
      }
    },
    { new: true }
  );

  return lockedRule ? { lockToken, lockUntil } : null;
};

const releaseReminderExecutionLock = async (ruleId: string, lockToken: string) => {
  await ReminderRule.updateOne(
    {
      _id: ruleId,
      'metadata.executionLockToken': lockToken
    },
    {
      $set: {
        'metadata.executionLockUntil': null,
        'metadata.executionLockToken': null
      }
    }
  );
};

const getReminderAudienceRecipients = async (rule: IReminderRule) => {
  const audienceUsers = await getAudienceUsers(rule.audience);

  if (audienceUsers.length === 0) {
    return { eligibleUsers: [], skippedCount: 0, skippedReason: 'no_audience_users' };
  }

  const ruleId = String(rule._id);
  const cooldownMinutes = Number(rule.cooldownMinutes || 0);
  const maxSendsPerUser = Number(rule.maxSendsPerUser || 1);

  const recentDeliveryStats = await UserNotification.aggregate([
    {
      $match: {
        userId: { $in: audienceUsers.map((user) => user.userId) },
        'metadata.reminderRuleId': ruleId
      }
    },
    {
      $group: {
        _id: '$userId',
        totalSent: { $sum: 1 },
        lastSentAt: { $max: '$createdAt' }
      }
    }
  ]);

  const statsByUserId = new Map<string, { totalSent: number; lastSentAt: Date | null }>();
  for (const item of recentDeliveryStats as Array<{ _id: string; totalSent: number; lastSentAt?: Date }>) {
    statsByUserId.set(String(item._id), {
      totalSent: Number(item.totalSent || 0),
      lastSentAt: item.lastSentAt ? new Date(item.lastSentAt) : null
    });
  }

  const eligibleUsers: Array<{ userId: string; email: string; role: string }> = [];
  let skippedCount = 0;
  const reasonCounts: Record<string, number> = {
    cooldown_active: 0,
    max_sends_reached: 0,
    cooldown_and_max_sends: 0
  };
  const now = new Date();

  for (const user of audienceUsers) {
    const stats = statsByUserId.get(user.userId);
    const eligibility = evaluateRecipientEligibility({
      stats,
      now,
      cooldownMinutes,
      maxSendsPerUser
    });

    if (!eligibility.eligible) {
      skippedCount += 1;
      if (eligibility.reason) {
        reasonCounts[eligibility.reason] = Number(reasonCounts[eligibility.reason] || 0) + 1;
      }
      continue;
    }

    eligibleUsers.push(user);
  }

  const breakdown = summarizeSkipBreakdown(reasonCounts);
  let skippedReason: string | null = null;
  if (breakdown.both > 0) {
    skippedReason = 'cooldown_and_max_sends';
  } else if (breakdown.maxSendsOnly > 0) {
    skippedReason = 'max_sends_reached';
  } else if (breakdown.cooldownOnly > 0) {
    skippedReason = 'cooldown_active';
  }

  return {
    eligibleUsers,
    audienceCount: audienceUsers.length,
    skippedCount,
    skippedByCooldown: breakdown.cooldownOnly + breakdown.both,
    skippedByMaxSends: breakdown.maxSendsOnly + breakdown.both,
    skipReasonCounts: reasonCounts,
    skippedReason
  };
};

const buildReminderSkipLog = async ({
  rule,
  reason,
  skippedCount,
  notes,
  nextRunAt
}: {
  rule: IReminderRule;
  reason: string;
  skippedCount: number;
  notes: string;
  nextRunAt?: Date | null;
}) => {
  if (nextRunAt) {
    rule.nextRunAt = nextRunAt;
    await rule.save();
  }

  return ReminderRunLog.create({
    ruleId: rule._id,
    status: 'skipped',
    recipientsCount: skippedCount,
    deliveredCount: 0,
    failedCount: 0,
    skippedCount,
    error: null,
    notes,
    metadata: {
      audience: rule.audience,
      scheduleType: rule.scheduleType,
      skippedReason: reason,
      reminderTriggerType: rule.triggerType
    },
    runAt: new Date()
  });
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
  triggerType?: 'session_start' | 'session_created' | 'session_rescheduled' | 'poll_ending' | 'tutor_application_followup' | 'payment_due' | 'inactive_users';
  timingMode?: 'before' | 'after';
  offsetMinutes?: number;
  audience: CommunicationAudience;
  channel?: 'email';
  scheduleType?: 'one_time' | 'recurring';
  scheduledFor?: string;
  repeatEveryMinutes?: number;
  templateSubject?: string;
  templateMessage?: string;
  actionUrl?: string;
  timezone?: string;
  quietHours?: { start: string; end: string };
  cooldownMinutes?: number;
  maxSendsPerUser?: number;
  createdBy?: string;
}) => {
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const now = new Date();

  const normalizedRepeatEveryMinutes =
    input.scheduleType === 'recurring' && Number(input.repeatEveryMinutes || 0) > 0
      ? Number(input.repeatEveryMinutes)
      : null;

  const nextRunAt = scheduledFor || now;

  const rule = await ReminderRule.create({
    name: input.name,
    description: input.description,
    triggerLabel: input.triggerLabel,
    triggerType: input.triggerType || 'session_start',
    timingMode: input.timingMode || 'before',
    offsetMinutes: Number.isFinite(Number(input.offsetMinutes)) ? Number(input.offsetMinutes) : 15,
    audience: input.audience,
    channel: 'email',
    scheduleType: input.scheduleType || 'one_time',
    scheduledFor,
    repeatEveryMinutes: normalizedRepeatEveryMinutes,
    templateSubject: input.templateSubject || input.name,
    templateMessage: input.templateMessage || input.description,
    actionUrl: input.actionUrl,
    timezone: String(input.timezone || 'Asia/Colombo').trim() || 'Asia/Colombo',
    quietHours: {
      start: input.quietHours?.start || '22:00',
      end: input.quietHours?.end || '07:00'
    },
    cooldownMinutes: Number.isFinite(Number(input.cooldownMinutes)) ? Number(input.cooldownMinutes) : 60,
    maxSendsPerUser: Number.isFinite(Number(input.maxSendsPerUser)) ? Number(input.maxSendsPerUser) : 1,
    status: 'active',
    nextRunAt,
    lastRunAt: null,
    runCount: 0,
    createdBy: input.createdBy,
    metadata: {
      domainVersion: 2
    }
  });

  return rule;
};

export const runReminderRule = async (ruleId: string, options?: { force?: boolean }) => {
  const executionStartedAt = Date.now();
  const rule = await ReminderRule.findById(ruleId);

  if (!rule) {
    throw new Error('Reminder rule not found');
  }

  if (rule.status !== 'active' && !options?.force) {
    throw new Error('Reminder rule is paused or completed');
  }

  const lock = await acquireReminderExecutionLock(ruleId);
  if (!lock) {
    const skippedLog = await ReminderRunLog.create({
      ruleId: rule._id,
      status: 'skipped',
      recipientsCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      skippedCount: 0,
      error: null,
      notes: 'Reminder execution skipped because another run is already in progress',
      metadata: {
        audience: rule.audience,
        scheduleType: rule.scheduleType,
        skippedReason: 'locked'
      },
      runAt: new Date()
    });

    return {
      rule,
      log: skippedLog,
      recipients: [],
      deliveredCount: 0,
      failedCount: 0,
      skippedCount: 0
    };
  }

  try {
    const now = new Date();
    const quietHoursEnd = !options?.force
      ? getNextQuietHoursEnd(now, String(rule.timezone || DEFAULT_TIME_ZONE), rule.quietHours)
      : null;

    if (quietHoursEnd) {
      const skipLog = await buildReminderSkipLog({
        rule,
        reason: 'quiet_hours',
        skippedCount: 0,
        notes: `Reminder deferred until ${quietHoursEnd.toISOString()} because it is inside quiet hours`,
        nextRunAt: quietHoursEnd
      });

      return {
        rule,
        log: skipLog,
        recipients: [],
        deliveredCount: 0,
        failedCount: 0,
        skippedCount: 0
      };
    }

    const {
      eligibleUsers,
      audienceCount,
      skippedCount,
      skippedReason,
      skippedByCooldown,
      skippedByMaxSends,
      skipReasonCounts
    } = await getReminderAudienceRecipients(rule);
    const recipients = dedupeEmails(eligibleUsers.map((user) => user.email));
    const html = buildEmailHtml(rule.templateSubject, rule.templateMessage, rule.actionUrl);

    if (recipients.length === 0) {
      const nextRunAt = rule.scheduleType === 'recurring' && Number(rule.repeatEveryMinutes || 0) > 0
        ? new Date(now.getTime() + Number(rule.repeatEveryMinutes) * 60 * 1000)
        : getNextQuietHoursEnd(now, String(rule.timezone || DEFAULT_TIME_ZONE), rule.quietHours) || null;

      const skipLog = await buildReminderSkipLog({
        rule,
        reason: skippedReason || 'no_eligible_recipients',
        skippedCount,
        notes: skippedCount > 0
          ? `Reminder skipped because no eligible recipients passed constraints (cooldownSkipped=${skippedByCooldown || 0}, maxSendsSkipped=${skippedByMaxSends || 0})`
          : 'Reminder skipped because there were no eligible recipients',
        nextRunAt
      });

      skipLog.metadata = {
        ...(skipLog.metadata || {}),
        audienceCount,
        eligibleRecipients: recipients.length,
        skipReasonCounts,
        executionDurationMs: Date.now() - executionStartedAt
      };
      await skipLog.save();

      return {
        rule,
        log: skipLog,
        recipients: [],
        deliveredCount: 0,
        failedCount: 0,
        skippedCount
      };
    }

    const audienceUsers = eligibleUsers;

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

    if (audienceUsers.length > 0) {
      await UserNotification.insertMany(
        audienceUsers.map((user) => ({
          userId: user.userId,
          email: user.email,
          role: user.role,
          title: rule.templateSubject,
          message: rule.templateMessage,
          audience: rule.audience,
          channel: 'in_app',
          status: 'unread',
          actionUrl: rule.actionUrl,
          metadata: {
            reminderRuleId: String(rule._id),
            reminderTriggerLabel: rule.triggerLabel,
            reminderTriggerType: rule.triggerType,
            createdBy: rule.createdBy || null,
            recipientEmail: user.email
          }
        })),
        { ordered: false }
      );
    }

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
      skippedCount,
      error: failedCount > 0 && deliveredCount === 0 ? 'One or more email batches failed' : null,
      notes: isRecurring ? `Next run scheduled for ${nextRunAt?.toISOString()}` : 'One-time reminder executed',
      metadata: {
        audience: rule.audience,
        scheduleType: rule.scheduleType,
        reminderTriggerType: rule.triggerType,
        audienceCount,
        eligibleRecipients: recipients.length,
        skippedCount,
        skippedReason,
        skippedByCooldown,
        skippedByMaxSends,
        skipReasonCounts,
        executionDurationMs: Date.now() - executionStartedAt
      },
      runAt: now
    });

    return {
      rule,
      log,
      recipients,
      deliveredCount,
      failedCount,
      skippedCount
    };
  } finally {
    await releaseReminderExecutionLock(ruleId, lock.lockToken).catch((error) => {
      console.error('❌ Failed to release reminder execution lock:', error);
    });
  }
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
      const result = await runReminderRule(String(rule._id));
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

export const getReminderAnalytics = async (days: number) => {
  const lookbackStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [statusAgg, totalsAgg, skipReasonAgg, activeRules, pausedRules, completedRules] = await Promise.all([
    ReminderRunLog.aggregate([
      { $match: { runAt: { $gte: lookbackStart } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    ReminderRunLog.aggregate([
      { $match: { runAt: { $gte: lookbackStart } } },
      {
        $group: {
          _id: null,
          deliveredCount: { $sum: '$deliveredCount' },
          failedCount: { $sum: '$failedCount' },
          skippedCount: { $sum: '$skippedCount' },
          averageExecutionDurationMs: { $avg: '$metadata.executionDurationMs' }
        }
      }
    ]),
    ReminderRunLog.aggregate([
      {
        $match: {
          runAt: { $gte: lookbackStart },
          'metadata.skippedReason': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$metadata.skippedReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    ReminderRule.countDocuments({ status: 'active' }),
    ReminderRule.countDocuments({ status: 'paused' }),
    ReminderRule.countDocuments({ status: 'completed' })
  ]);

  const statusCounts: Record<string, number> = { success: 0, failed: 0, skipped: 0 };
  for (const item of statusAgg as Array<{ _id: string; count: number }>) {
    if (item?._id) {
      statusCounts[String(item._id)] = Number(item.count || 0);
    }
  }

  const totals = (totalsAgg[0] || {
    deliveredCount: 0,
    failedCount: 0,
    skippedCount: 0,
    averageExecutionDurationMs: 0
  }) as {
    deliveredCount: number;
    failedCount: number;
    skippedCount: number;
    averageExecutionDurationMs: number;
  };

  return {
    lookbackDays: days,
    windowStartAt: lookbackStart,
    totals: {
      runs: statusCounts.success + statusCounts.failed + statusCounts.skipped,
      success: statusCounts.success,
      failed: statusCounts.failed,
      skipped: statusCounts.skipped,
      delivered: Number(totals.deliveredCount || 0),
      deliveryFailed: Number(totals.failedCount || 0),
      recipientsSkipped: Number(totals.skippedCount || 0),
      averageExecutionDurationMs: Math.round(Number(totals.averageExecutionDurationMs || 0))
    },
    rulesByStatus: {
      active: activeRules,
      paused: pausedRules,
      completed: completedRules
    },
    topSkippedReasons: (skipReasonAgg as Array<{ _id: string; count: number }>).map((item) => ({
      reason: item._id,
      count: Number(item.count || 0)
    }))
  };
};
