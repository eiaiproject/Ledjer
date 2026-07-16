import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  getTransaction,
  listJournalEntriesForTransaction,
  listTransactions,
  postTransaction,
  settlePartialTransaction,
  voidTransaction,
} from "../services/transactions.service";

const transactionTypeSchema = z.enum([
  "cash_sale",
  "credit_sale",
  "receive_receivable",
  "cash_purchase",
  "credit_purchase",
  "pay_payable",
  "expense_payment",
  "owner_capital",
  "owner_draw",
  "cash_transfer",
]);

const paymentStatusSchema = z.enum(["paid", "unpaid", "partial"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const postTransactionSchema = z.object({
  transactionDate: dateSchema,
  transactionType: transactionTypeSchema,
  amount: z.number().positive(),
  partyId: z.string().nullable().optional(),
  partyName: z.string().max(160).nullable().optional(),
  categoryName: z.string().max(160).nullable().optional(),
  cashAccountId: z.string().nullable().optional(),
  destinationCashAccountId: z.string().nullable().optional(),
  paymentStatus: paymentStatusSchema.default("paid"),
  partialAmount: z.number().positive().nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  description: z.string().min(1).max(500),
  notes: z.string().max(1000).nullable().optional(),
  productId: z.string().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  unitPrice: z.number().min(0).nullable().optional(),
  debitAccountId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
});

const voidTransactionSchema = z.object({
  reason: z.string().min(5).max(500),
  voidDate: dateSchema.nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
});

const settleTransactionSchema = z.object({
  cashAccountId: z.string(),
  idempotencyKey: z.string().min(8).max(160),
});

export const transactionsRoutes = new Hono<AppContext>();

transactionsRoutes.use("*", requireAuth());
transactionsRoutes.use("*", loadCurrentOrganization());

transactionsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const transactions = await listTransactions(c.env.DB, context.organization.id, {
    search: url.searchParams.get("search") ?? undefined,
    transactionType: url.searchParams.get("transactionType") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    fromDate: url.searchParams.get("fromDate") ?? undefined,
    toDate: url.searchParams.get("toDate") ?? undefined,
    limit: parseInteger(url.searchParams.get("limit")),
    offset: parseInteger(url.searchParams.get("offset")),
  });
  return c.json({ transactions });
});

transactionsRoutes.post("/", requirePermission("transactions:create"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, postTransactionSchema);
  const result = await postTransaction(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
    c.get("requestId"),
  );
  return c.json(result);
});

transactionsRoutes.get("/:transactionId/journal", requirePermission("reports:read"), async (c) => {
  const context = c.get("organizationContext");
  const journalEntries = await listJournalEntriesForTransaction(
    c.env.DB,
    context.organization.id,
    c.req.param("transactionId"),
  );
  return c.json({ journalEntries });
});

transactionsRoutes.get("/:transactionId", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const transaction = await getTransaction(
    c.env.DB,
    context.organization.id,
    c.req.param("transactionId"),
  );
  return c.json({ transaction });
});

transactionsRoutes.post("/:transactionId/void", requirePermission("transactions:void"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, voidTransactionSchema);
  const result = await voidTransaction(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("transactionId"),
    body,
    c.get("requestId"),
  );
  return c.json(result);
});

transactionsRoutes.post("/:transactionId/settle", requirePermission("transactions:create"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, settleTransactionSchema);
  const result = await settlePartialTransaction(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("transactionId"),
    body.cashAccountId,
    body.idempotencyKey,
    c.get("requestId"),
  );
  return c.json(result);
});

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
