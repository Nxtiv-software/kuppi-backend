export type CommunicationAudience = 'all' | 'students' | 'tutors' | 'admins' | 'custom';
export type CommunicationChannel = 'email';
export type CommunicationCampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';
export type ReminderStatus = 'active' | 'paused' | 'completed';
export type ReminderScheduleType = 'one_time' | 'recurring';
export type ReminderTriggerType =
  | 'session_start'
  | 'session_created'
  | 'session_rescheduled'
  | 'poll_ending'
  | 'tutor_application_followup'
  | 'payment_due'
  | 'inactive_users';
export type ReminderTimingMode = 'before' | 'after';

export interface ReminderQuietHours {
  start: string;
  end: string;
}

export interface CreateCommunicationCampaignRequest {
  title: string;
  message: string;
  audience: CommunicationAudience;
  channel?: CommunicationChannel;
  actionUrl?: string;
  customRecipientEmails?: string[];
}

export interface CreateReminderRuleRequest {
  name: string;
  description: string;
  triggerLabel: string;
  triggerType?: ReminderTriggerType;
  timingMode?: ReminderTimingMode;
  offsetMinutes?: number;
  audience: CommunicationAudience;
  channel?: CommunicationChannel;
  scheduleType?: ReminderScheduleType;
  scheduledFor?: string;
  repeatEveryMinutes?: number;
  templateSubject?: string;
  templateMessage?: string;
  actionUrl?: string;
  timezone?: string;
  quietHours?: ReminderQuietHours;
  cooldownMinutes?: number;
  maxSendsPerUser?: number;
}
