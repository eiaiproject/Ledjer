export interface JournalLineInput {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
  partyId?: string | null;
}

export interface PostManualJournalInput {
  entryDate: string;
  entryType: string;
  description: string;
  lines: JournalLineInput[];
  idempotencyKey: string;
}

export interface ManualJournalResult {
  journalEntryId: string;
  entryNumber: string;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface PreviewManualJournalResult {
  entryType: string;
  entryDate: string;
  description: string;
  lines: (JournalLineInput & { accountName: string; accountCode: string })[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface JournalTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  entryType: string;
  lines: JournalLineInput[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClosingPreview {
  lines: JournalLineInput[];
  totals: { revenue: number; expense: number; netIncome: number };
}

export async function previewManualJournal(
  input: PostManualJournalInput,
): Promise<PreviewManualJournalResult> {
  const res = await fetch("/api/manual-journals/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to preview journal");
  return res.json() as Promise<PreviewManualJournalResult>;
}

export async function postManualJournal(
  input: PostManualJournalInput,
): Promise<ManualJournalResult> {
  const res = await fetch("/api/manual-journals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to post manual journal");
  return res.json() as Promise<ManualJournalResult>;
}

export async function previewClosingJournal(
  closingDate: string,
): Promise<ClosingPreview> {
  const res = await fetch(`/api/manual-journals/closing-preview?closingDate=${closingDate}`);
  if (!res.ok) throw new Error("Failed to preview closing journal");
  return res.json() as Promise<ClosingPreview>;
}

export async function postClosingJournal(
  entryDate: string,
  idempotencyKey: string,
): Promise<ManualJournalResult & { totals: { revenue: number; expense: number; netIncome: number } }> {
  const res = await fetch("/api/manual-journals/closing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryDate, idempotencyKey }),
  });
  if (!res.ok) throw new Error("Failed to post closing journal");
  return res.json() as Promise<ManualJournalResult & { totals: { revenue: number; expense: number; netIncome: number } }>;
}

export async function listJournalTemplates(entryType?: string): Promise<JournalTemplate[]> {
  const params = entryType ? `?entryType=${entryType}` : "";
  const res = await fetch(`/api/manual-journals/templates${params}`);
  if (!res.ok) throw new Error("Failed to fetch templates");
  const data = await res.json() as { templates: JournalTemplate[] };
  return data.templates;
}

export async function getJournalTemplate(id: string): Promise<JournalTemplate> {
  const res = await fetch(`/api/manual-journals/templates/${id}`);
  if (!res.ok) throw new Error("Failed to fetch template");
  const data = await res.json() as { template: JournalTemplate };
  return data.template;
}

export async function saveJournalTemplate(
  name: string,
  description: string,
  entryType: string,
  lines: JournalLineInput[],
): Promise<JournalTemplate> {
  const res = await fetch("/api/manual-journals/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, entryType, lines }),
  });
  if (!res.ok) throw new Error("Failed to save template");
  const data = await res.json() as { template: JournalTemplate };
  return data.template;
}

export async function deleteJournalTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/manual-journals/templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete template");
}
