import { apiRequest } from "./client";

export interface AttachmentInfo {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  entityType: string;
  entityId: string;
  transactionId: string | null;
  uploadedBy: string;
  createdAt: number;
}

export function listAttachments(entityType: string, entityId: string): Promise<{ attachments: AttachmentInfo[] }> {
  return apiRequest(`/api/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
}

export function deleteAttachment(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/attachments/${id}`, { method: "DELETE" });
}

export function getAttachmentDownloadUrl(id: string): string {
  return `/api/attachments/${id}/download`;
}
