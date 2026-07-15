import { apiRequest } from "./client";

export interface PeriodLock {
  id: string;
  organizationId: string;
  lockedThroughDate: string;
  reason: string | null;
  lockedBy: string;
  createdAt: string;
}

export async function listPeriodLocks(): Promise<{ periodLocks: PeriodLock[] }> {
  return apiRequest("/api/period-locks");
}

export async function createPeriodLock(input: {
  lockedThroughDate: string;
  reason?: string;
}): Promise<{ periodLock: PeriodLock }> {
  return apiRequest("/api/period-locks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deletePeriodLock(
  lockId: string,
  reason: string,
): Promise<{ success: boolean }> {
  return apiRequest(`/api/period-locks/${lockId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}
