import mongoose, { Document, Schema } from 'mongoose';
import { CommunicationAudience, CommunicationChannel, ReminderScheduleType, ReminderStatus } from '../types/communication';

export interface IReminderRule extends Document {
  name: string;
  description: string;
  triggerLabel: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  scheduleType: ReminderScheduleType;
  scheduledFor?: Date | null;
  repeatEveryMinutes?: number | null;
  templateSubject: string;
  templateMessage: string;
  actionUrl?: string;
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
    repeatEveryMinutes: { type: Number, default: null },
    templateSubject: { type: String, required: true, trim: true, maxlength: 200 },
    templateMessage: { type: String, required: true, trim: true, maxlength: 4000 },
    actionUrl: { type: String, trim: true },
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
ReminderRuleSchema.index({ createdAt: -1 });

export default mongoose.model<IReminderRule>('ReminderRule', ReminderRuleSchema);
