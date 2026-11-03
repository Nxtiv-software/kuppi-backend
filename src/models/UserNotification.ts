import mongoose, { Document, Schema } from 'mongoose';

export type UserNotificationAudience = 'all' | 'students' | 'tutors' | 'admins' | 'custom';
export type UserNotificationChannel = 'in_app' | 'email';
export type UserNotificationStatus = 'unread' | 'read';

export interface IUserNotification extends Document {
  userId: string;
  email?: string;
  role?: string;
  title: string;
  message: string;
  audience: UserNotificationAudience;
  channel: UserNotificationChannel;
  status: UserNotificationStatus;
  actionUrl?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserNotificationSchema = new Schema<IUserNotification>(
  {
    userId: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true },
    role: { type: String, trim: true },
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
      enum: ['in_app', 'email'],
      required: true,
      default: 'in_app'
    },
    status: {
      type: String,
      enum: ['unread', 'read'],
      required: true,
      default: 'unread'
    },
    actionUrl: { type: String, trim: true },
    campaignId: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

UserNotificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
UserNotificationSchema.index({ campaignId: 1, createdAt: -1 });

export default mongoose.model<IUserNotification>('UserNotification', UserNotificationSchema);
