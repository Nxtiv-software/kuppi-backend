import mongoose, { Document, Schema } from 'mongoose';

export type AdminNotificationCategory = 'tutor_application' | 'session' | 'poll' | 'integration' | 'system';
export type AdminNotificationSeverity = 'info' | 'warning' | 'critical';
export type AdminNotificationStatus = 'unread' | 'read';
export type AdminNotificationSourceType = 'TutorApplication' | 'Session' | 'Poll' | 'Email' | 'System';

export interface IAdminNotification extends Document {
  adminId: string;
  title: string;
  message: string;
  category: AdminNotificationCategory;
  severity: AdminNotificationSeverity;
  status: AdminNotificationStatus;
  sourceType?: AdminNotificationSourceType;
  sourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminNotificationSchema: Schema = new Schema(
  {
    adminId: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    category: {
      type: String,
      enum: ['tutor_application', 'session', 'poll', 'integration', 'system'],
      required: true,
      default: 'system'
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      required: true,
      default: 'info'
    },
    status: {
      type: String,
      enum: ['unread', 'read'],
      required: true,
      default: 'unread'
    },
    sourceType: {
      type: String,
      enum: ['TutorApplication', 'Session', 'Poll', 'Email', 'System']
    },
    sourceId: {
      type: String,
      trim: true
    },
    actionUrl: {
      type: String,
      trim: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

AdminNotificationSchema.index({ adminId: 1, status: 1, createdAt: -1 });
AdminNotificationSchema.index({ adminId: 1, category: 1, createdAt: -1 });
AdminNotificationSchema.index({ sourceType: 1, sourceId: 1 });

export default mongoose.model<IAdminNotification>('AdminNotification', AdminNotificationSchema);
