import AdminNotification, {
  AdminNotificationCategory,
  AdminNotificationSeverity,
  AdminNotificationSourceType
} from '../models/AdminNotification';
import User from '../models/user';

interface AdminNotificationPayload {
  title: string;
  message: string;
  category: AdminNotificationCategory;
  severity?: AdminNotificationSeverity;
  sourceType?: AdminNotificationSourceType;
  sourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

const getAllAdminClerkIds = async (): Promise<string[]> => {
  const admins = await User.find({ role: 'admin', clerkId: { $exists: true, $ne: null } })
    .select('clerkId')
    .lean();

  return admins
    .map((admin: any) => admin.clerkId)
    .filter((clerkId: unknown): clerkId is string => typeof clerkId === 'string' && clerkId.trim().length > 0);
};

const buildNotificationDocument = (adminId: string, payload: AdminNotificationPayload) => ({
  adminId,
  title: payload.title,
  message: payload.message,
  category: payload.category,
  severity: payload.severity || 'info',
  status: 'unread',
  sourceType: payload.sourceType,
  sourceId: payload.sourceId,
  actionUrl: payload.actionUrl,
  metadata: payload.metadata || {}
});

export const createNotificationForAdmin = async (adminId: string, payload: AdminNotificationPayload) => {
  if (!adminId || !adminId.trim()) {
    return null;
  }

  return AdminNotification.create(buildNotificationDocument(adminId, payload));
};

export const createNotificationForAllAdmins = async (
  payload: AdminNotificationPayload,
  options?: { excludeAdminId?: string }
) => {
  const adminIds = await getAllAdminClerkIds();

  const filteredAdminIds = options?.excludeAdminId
    ? adminIds.filter((id) => id !== options.excludeAdminId)
    : adminIds;

  if (filteredAdminIds.length === 0) {
    console.log('ℹ️ No admin users with Clerk IDs found for notification delivery');
    return [];
  }

  const docs = filteredAdminIds.map((adminId) => buildNotificationDocument(adminId, payload));
  return AdminNotification.insertMany(docs, { ordered: false });
};

export default {
  createNotificationForAdmin,
  createNotificationForAllAdmins
};
