import { apiRequest } from "./client";

export type NotificationCategory =
  | "overdue_receivable" | "upcoming_payable" | "low_stock"
  | "pending_approval" | "unclosed_period" | "team_invitation"
  | "import_failed" | "export_completed" | "backup_failed"
  | "role_changed" | "new_device_login" | "recurring_failed"
  | "system";

export type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface NotificationOutput {
  id: string;
  organizationId: string;
  recipientUserId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  severity: NotificationSeverity;
  isRead: boolean;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: number;
  readAt: number | null;
}

export interface UnreadCount {
  total: number;
  byCategory: Record<string, number>;
}

export function listNotifications(
  unreadOnly = false,
  limit = 50,
  offset = 0,
): Promise<NotificationOutput[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (unreadOnly) params.set("unread", "true");
  return apiRequest<NotificationOutput[]>(`/api/notifications?${params}`);
}

export function getUnreadCount(): Promise<UnreadCount> {
  return apiRequest<UnreadCount>("/api/notifications/unread-count");
}

export function markAsRead(id: string): Promise<NotificationOutput> {
  return apiRequest<NotificationOutput>(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllAsRead(): Promise<{ markedRead: number }> {
  return apiRequest<{ markedRead: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}

export function dismissNotification(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/notifications/${id}`, {
    method: "DELETE",
  });
}

export function dismissAll(category?: NotificationCategory): Promise<{ dismissed: number }> {
  return apiRequest<{ dismissed: number }>("/api/notifications/dismiss-all", {
    method: "POST",
    body: JSON.stringify({ category }),
  });
}

export function generateNotifications(): Promise<{ generated: number }> {
  return apiRequest<{ generated: number }>("/api/notifications/generate", {
    method: "POST",
  });
}
