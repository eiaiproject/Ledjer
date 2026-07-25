export interface CloseCheck {
  id: string;
  label: string;
  description: string;
  status: "passed" | "failed" | "warning" | "skipped";
  detail: string | null;
  actionPath: string | null;
}

export interface CloseChecklistResult {
  periodEndDate: string;
  checks: CloseCheck[];
  allPassed: boolean;
  canLock: boolean;
}

export interface ClosePeriodResult {
  checklist: CloseChecklistResult;
  snapshot: { id: string };
  lock: { id: string; lockedThroughDate: string };
}

export async function runChecklist(periodEndDate: string): Promise<CloseChecklistResult> {
  const res = await fetch(`/api/period-close/checklist?periodEndDate=${encodeURIComponent(periodEndDate)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to run checklist");
  }
  return res.json() as Promise<CloseChecklistResult>;
}

export async function closePeriod(
  periodEndDate: string,
  reason?: string,
): Promise<ClosePeriodResult> {
  const res = await fetch("/api/period-close/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodEndDate, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? "Failed to close period");
  }
  return res.json() as Promise<ClosePeriodResult>;
}
