import mongoose, { Document, Schema } from 'mongoose';
import {
  CommunicationAudience,
  CommunicationChannel,
  ReminderScheduleType,
  ReminderStatus,
  ReminderTimingMode,
  ReminderTriggerType
} from '../types/communication';

interface IReminderQuietHours {
  start: string;
  end: string;
}

export interface IReminderRule extends Document {
  name: string;
  description: string;
  triggerLabel: string;
  triggerType: ReminderTriggerType;
  timingMode: ReminderTimingMode;
  offsetMinutes: number;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  scheduleType: ReminderScheduleType;
  scheduledFor?: Date | null;
  repeatEveryMinutes?: number | null;
  templateSubject: string;
  templateMessage: string;
  actionUrl?: string;
  timezone: string;
  quietHours: IReminderQuietHours;
  cooldownMinutes: number;
  maxSendsPerUser: number;
  status: ReminderStatus;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
  runCount: number;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderRuleSchema = new Schema<IReminderRule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    triggerLabel: { type: String, required: true, trim: true, maxlength: 200 },
    triggerType: {
      type: String,
      enum: ['session_start', 'session_created', 'session_rescheduled', 'poll_ending', 'tutor_application_followup', 'payment_due', 'inactive_users'],
      required: true,
      default: 'session_start'
    },
    timingMode: {
      type: String,
      enum: ['before', 'after'],
      required: true,
      default: 'before'
    },
    offsetMinutes: { type: Number, required: true, default: 15, min: 0, max: 43200 },
    audience: {
      type: String,
      enum: ['all', 'students', 'tutors', 'admins', 'custom'],
      required: true,
      default: 'students'
    },
    channel: {
      type: String,
      enum: ['email'],
      required: true,
      default: 'email'
    },
    scheduleType: {
      type: String,
      enum: ['one_time', 'recurring'],
      required: true,
      default: 'one_time'
    },
    scheduledFor: { type: Date, default: null },
    repeatEveryMinutes: { type: Number, default: null, min: 1, max: 10080 },
    templateSubject: { type: String, required: true, trim: true, maxlength: 200 },
    templateMessage: { type: String, required: true, trim: true, maxlength: 4000 },
    actionUrl: { type: String, trim: true },
    timezone: { type: String, required: true, trim: true, default: 'Asia/Colombo', maxlength: 100 },
    quietHours: {
      start: { type: String, required: true, default: '22:00' },
      end: { type: String, required: true, default: '07:00' }
    },
    cooldownMinutes: { type: Number, required: true, default: 60, min: 0, max: 10080 },
    maxSendsPerUser: { type: Number, required: true, default: 1, min: 1, max: 1000 },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      required: true,
      default: 'active'
    },
    nextRunAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    runCount: { type: Number, default: 0 },
    createdBy: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

ReminderRuleSchema.index({ status: 1, nextRunAt: 1 });
ReminderRuleSchema.index({ triggerType: 1, status: 1, nextRunAt: 1 });
ReminderRuleSchema.index({ createdAt: -1 });

export default mongoose.model<IReminderRule>('ReminderRule', ReminderRuleSchema);
