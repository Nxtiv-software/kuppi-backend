export type AdminNotificationCategory = 'tutor_application' | 'session' | 'poll' | 'integration' | 'system';
export type AdminNotificationSeverity = 'info' | 'warning' | 'critical';
export type AdminNotificationStatus = 'unread' | 'read';
export type AdminNotificationSourceType = 'TutorApplication' | 'Session' | 'Poll' | 'Email' | 'System';

export interface CreateAdminNotificationRequest {
  adminId: string;
  title: string;
  message: string;
  category: AdminNotificationCategory;
  severity?: AdminNotificationSeverity;
  sourceType?: AdminNotificationSourceType;
  sourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  status?: AdminNotificationStatus | 'all';
  category?: AdminNotificationCategory | 'all';
  severity?: AdminNotificationSeverity | 'all';
}

export interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationListResponse<T> {
  notifications: T[];
  unreadCount: number;
  pagination: NotificationPagination;
}
