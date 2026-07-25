export type ActionType =
  | "transaction_create"
  | "transaction_void"
  | "period_reopen"
  | "stock_adjustment"
  | "manual_journal";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalConfig {
  id: string;
  organizationId: string;
  actionType: ActionType;
  thresholdMinor: number;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  actionType: ActionType;
  entityType: string;
  entityId: string;
  entitySummary: string | null;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: number;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedByName?: string | null;
  approvedAt: number | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  amountMinor: number;
  metadata: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<ActionType, string> = {
  transaction_create: "Transaksi Baru",
  transaction_void: "Pembatalan Transaksi",
  period_reopen: "Pembukaan Periode",
  stock_adjustment: "Penyesuaian Stok",
  manual_journal: "Jurnal Manual",
};

export function actionTypeLabel(type: ActionType): string {
  return ACTION_LABELS[type] ?? type;
}

export async function listApprovalConfigs(): Promise<ApprovalConfig[]> {
  const res = await fetch("/api/approvals/config");
  if (!res.ok) throw new Error("Failed to fetch approval configs");
  const data = await res.json() as { configs: ApprovalConfig[] };
  return data.configs;
}

export async function upsertApprovalConfig(
  actionType: ActionType,
  thresholdMinor: number,
  enabled: boolean,
): Promise<ApprovalConfig> {
  const res = await fetch("/api/approvals/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionType, thresholdMinor, enabled }),
  });
  if (!res.ok) throw new Error("Failed to update approval config");
  const data = await res.json() as { config: ApprovalConfig };
  return data.config;
}

export async function createApprovalRequest(
  actionType: ActionType,
  entityType: string,
  entityId: string,
  entitySummary?: string,
  amountMinor = 0,
  metadata?: Record<string, unknown>,
): Promise<ApprovalRequest> {
  const res = await fetch("/api/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionType, entityType, entityId,
      entitySummary: entitySummary ?? null,
      amountMinor,
      metadata: metadata ?? null,
    }),
  });
  if (!res.ok) throw new Error("Failed to create approval request");
  const data = await res.json() as { request: ApprovalRequest };
  return data.request;
}

export async function listApprovalRequests(opts?: {
  status?: ApprovalStatus;
  actionType?: ActionType;
  limit?: number;
  offset?: number;
}): Promise<ApprovalRequest[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.actionType) params.set("actionType", opts.actionType);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const url = `/api/approvals${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch approval requests");
  const data = await res.json() as { requests: ApprovalRequest[] };
  return data.requests;
}

export async function getApprovalRequest(id: string): Promise<ApprovalRequest> {
  const res = await fetch(`/api/approvals/${id}`);
  if (!res.ok) throw new Error("Failed to fetch approval request");
  const data = await res.json() as { request: ApprovalRequest };
  return data.request;
}

export async function getPendingApprovalCount(): Promise<number> {
  const res = await fetch("/api/approvals/pending-count");
  if (!res.ok) throw new Error("Failed to fetch pending approval count");
  const data = await res.json() as { count: number };
  return data.count;
}

export async function approveApprovalRequest(
  id: string,
  note?: string,
): Promise<ApprovalRequest> {
  const res = await fetch(`/api/approvals/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: note ?? null }),
  });
  if (!res.ok) throw new Error("Failed to approve request");
  const data = await res.json() as { request: ApprovalRequest };
  return data.request;
}

export async function rejectApprovalRequest(
  id: string,
  reason: string,
  note?: string,
): Promise<ApprovalRequest> {
  const res = await fetch(`/api/approvals/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, note: note ?? null }),
  });
  if (!res.ok) throw new Error("Failed to reject request");
  const data = await res.json() as { request: ApprovalRequest };
  return data.request;
}
