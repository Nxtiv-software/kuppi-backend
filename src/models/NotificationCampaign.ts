import mongoose, { Document, Schema } from 'mongoose';
import { CommunicationAudience, CommunicationCampaignStatus, CommunicationChannel } from '../types/communication';

export interface INotificationCampaign extends Document {
  title: string;
  message: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  status: CommunicationCampaignStatus;
  actionUrl?: string;
  customRecipientEmails?: string[];
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  openedCount: number;
  scheduledFor?: Date | null;
  sentAt?: Date | null;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationCampaignSchema = new Schema<INotificationCampaign>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    audience: {
      type: String,
      enum: ['all', 'students', 'tutors', 'admins', 'custom'],
      required: true,
      default: 'all'
    },
    channel: {
      type: String,
      enum: ['email'],
      required: true,
      default: 'email'
    },
    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'failed'],
      required: true,
      default: 'draft'
    },
    actionUrl: { type: String, trim: true },
    customRecipientEmails: [{ type: String, trim: true }],
    recipientCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    scheduledFor: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    createdBy: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

NotificationCampaignSchema.index({ createdAt: -1 });
NotificationCampaignSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<INotificationCampaign>('NotificationCampaign', NotificationCampaignSchema);
