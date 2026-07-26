// ponytail: Receivables/payables over invoicing. Assumes invoices track both
// AR (customer invoices) and AP (supplier bills via party type).
// Aging bands: current, 1-30, 31-60, 61-90, 90+ days overdue.

import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, notFound } from "../http/errors";

const AGING_BANDS = [
  { label: "current", maxDays: 0 },
  { label: "1-30", maxDays: 30 },
  { label: "31-60", maxDays: 60 },
  { label: "61-90", maxDays: 90 },
  { label: "90+", maxDays: Infinity },
] as const;

export interface AgingBucket {
  label: string;
  totalMinor: number;
  count: number;
}

export interface PartyAging {
  partyId: string;
  partyName: string;
  totalOutstanding: number;
  buckets: AgingBucket[];
}

async function getOutstandingAmount(
  db: D1Database,
  organizationId: string,
  invoiceId: string,
): Promise<number> {
  const inv = await queryFirst<{ total_minor: number }>(
    db,
    `SELECT total_minor FROM invoices WHERE id = ? AND organization_id = ?`,
    [invoiceId, organizationId],
  );
  if (!inv) return 0;

  const paid = await queryFirst<{ paid: number }>(
    db,
    `SELECT COALESCE(SUM(amount_minor), 0) as paid FROM payment_allocations WHERE invoice_id = ?`,
    [invoiceId],
  );

  return inv.total_minor - (paid?.paid ?? 0);
}

export async function recordPayment(
  db: D1Database,
  organizationId: string,
  userId: string,
  invoiceId: string,
  amountMinor: number,
  allocationDate: string,
  transactionId?: string,
  notes?: string,
): Promise<void> {
  if (amountMinor <= 0) throw badRequest("invalid_amount", "Jumlah harus lebih dari 0");

  const outstanding = await getOutstandingAmount(db, organizationId, invoiceId);

  if (amountMinor > outstanding) {
    throw badRequest("overpayment", `Jumlah pembayaran (${amountMinor}) melebihi sisa tagihan (${outstanding})`);
  }

  const id = generateId();
  const now = Date.now();

  await execute(
    db,
    `INSERT INTO payment_allocations (id, organization_id, invoice_id, transaction_id, amount_minor, allocation_date, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, organizationId, invoiceId, transactionId ?? null, amountMinor, allocationDate, notes ?? null, userId, now],
  );

  // Update invoice paid_minor and status
  const totalPaid = await queryFirst<{ paid: number }>(
    db,
    `SELECT COALESCE(SUM(amount_minor), 0) as paid FROM payment_allocations WHERE invoice_id = ?`,
    [invoiceId],
  );

  const invTotal = await queryFirst<{ total_minor: number; status: string }>(
    db,
    `SELECT total_minor, status FROM invoices WHERE id = ?`,
    [invoiceId],
  );

  const newPaid = totalPaid?.paid ?? 0;
  let newStatus = invTotal?.status ?? "issued";
  if (newPaid >= (invTotal?.total_minor ?? 0)) {
    newStatus = "paid";
  } else if (newStatus === "issued" || newStatus === "sent") {
    newStatus = "partially_paid";
  }

  await execute(
    db,
    `UPDATE invoices SET paid_minor = ?, status = ?, updated_at = ? WHERE id = ?`,
    [newPaid, newStatus, now, invoiceId],
  );

  if (newStatus === "paid") {
    await execute(
      db,
      `UPDATE invoices SET paid_at = ? WHERE id = ?`,
      [now, invoiceId],
    );
  }

  // Audit log
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, after_json, created_at)
     VALUES (?, ?, ?, 'payment_allocation', ?, 'created', ?, ?)`,
    [generateId(), organizationId, userId, id,
     JSON.stringify({ invoiceId, amountMinor, newPaid, newStatus }), now],
  );
}

export async function getAgingReport(
  db: D1Database,
  organizationId: string,
  partyType?: string,
  asOfDate?: string,
): Promise<PartyAging[]> {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);

  // Get unpaid / partially paid invoices
  const invoices = await queryAll<{
    id: string; party_id: string; due_date: string;
    total_minor: number; invoice_number: string;
  }>(
    db,
    `SELECT i.id, i.party_id, i.due_date, i.total_minor, i.invoice_number
     FROM invoices i
     WHERE i.organization_id = ?
       AND i.status IN ('issued', 'sent', 'partially_paid', 'overdue')
       ${partyType ? `AND i.party_id IN (SELECT id FROM parties WHERE organization_id = ? AND party_type = ?)` : ""}
     ORDER BY i.due_date`,
    partyType
      ? [organizationId, organizationId, partyType]
      : [organizationId],
  );

  // Group by party
  const partyMap = new Map<string, { id: string; dueDate: string; totalMinor: number; invoiceNumber: string }[]>();

  for (const inv of invoices) {
    const outstanding = await getOutstandingAmount(db, organizationId, inv.id);
    if (outstanding <= 0) continue;

    const entry = partyMap.get(inv.party_id) ?? [];
    entry.push({ id: inv.id, dueDate: inv.due_date, totalMinor: outstanding, invoiceNumber: inv.invoice_number });
    partyMap.set(inv.party_id, entry);
  }

  // Build aging per party
  const result: PartyAging[] = [];

  for (const [partyId, partyInvs] of partyMap) {
    const party = await queryFirst<{ name: string }>(
      db, `SELECT name FROM parties WHERE id = ?`, [partyId],
    );

    const buckets: AgingBucket[] = AGING_BANDS.map((b) => ({ label: b.label, totalMinor: 0, count: 0 }));

    for (const inv of partyInvs) {
      const daysOverdue = daysBetween(inv.dueDate, date);
      const bucketIdx = daysOverdue <= 0 ? 0 : Math.min(Math.ceil(Math.max(daysOverdue, 1) / 30), 4);

      buckets[bucketIdx].totalMinor += inv.totalMinor;
      buckets[bucketIdx].count++;
    }

    result.push({
      partyId,
      partyName: party?.name ?? "(dihapus)",
      totalOutstanding: buckets.reduce((s, b) => s + b.totalMinor, 0),
      buckets,
    });
  }

  return result;
}

export async function getPartyStatement(
  db: D1Database,
  organizationId: string,
  partyId: string,
): Promise<{
  partyId: string;
  partyName: string;
  invoices: { invoiceId: string; invoiceNumber: string; date: string; dueDate: string; totalMinor: number; outstandingMinor: number; status: string }[];
  totalOutstanding: number;
}> {
  const party = await queryFirst<{ name: string }>(
    db, `SELECT name FROM parties WHERE id = ? AND organization_id = ?`,
    [partyId, organizationId],
  );
  if (!party) throw notFound("party_not_found", "Pelanggan/pemasok tidak ditemukan");

  const invoices = await queryAll<{
    id: string; invoice_number: string; invoice_date: string;
    due_date: string; total_minor: number; status: string;
  }>(
    db,
    `SELECT id, invoice_number, invoice_date, due_date, total_minor, status
     FROM invoices WHERE organization_id = ? AND party_id = ?
     ORDER BY invoice_date DESC`,
    [organizationId, partyId],
  );

  let totalOutstanding = 0;
  const invLines = [];

  for (const inv of invoices) {
    const outstanding = await getOutstandingAmount(db, organizationId, inv.id);
    totalOutstanding += outstanding;
    invLines.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      date: inv.invoice_date,
      dueDate: inv.due_date,
      totalMinor: inv.total_minor,
      outstandingMinor: outstanding,
      status: inv.status,
    });
  }

  return {
    partyId,
    partyName: party.name,
    invoices: invLines,
    totalOutstanding,
  };
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}
