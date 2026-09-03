import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import {
  countTransactions,
  getTransaction,
  listTransactions,
  postTransaction,
  voidTransaction,
} from "../services/transactions.service";

const transactionTypeSchema = z.enum(["cash_in", "cash_out", "transfer", "owner_deposit", "owner_withdrawal"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const postTransactionSchema = z.object({
  transactionType: transactionTypeSchema,
  transactionDate: dateSchema,
  cashAccountId: z.string().min(1),
  counterAccountId: z.string().min(1),
  amountIdr: z.number().positive(),
  description: z.string().min(1).max(200),
  idempotencyKey: z.string().min(8).max(160),
});

const voidTransactionSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export const transactionsRoutes = new Hono<AppContext>();

transactionsRoutes.use("*", requireAuth());
transactionsRoutes.use("*", loadCurrentOrganization());

transactionsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const filters = {
    search: url.searchParams.get("search") ?? undefined,
    transactionType: url.searchParams.get("transactionType") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    fromDate: url.searchParams.get("fromDate") ?? undefined,
    toDate: url.searchParams.get("toDate") ?? undefined,
    limit: parseInteger(url.searchParams.get("limit")),
    offset: parseInteger(url.searchParams.get("offset")),
  };
  const [transactions, total] = await Promise.all([
    listTransactions(c.env.DB, context.organization.id, filters),
    countTransactions(c.env.DB, context.organization.id, filters),
  ]);
  return c.json({ transactions, total });
});

transactionsRoutes.post("/", requirePermission("transactions:create"), async (c) => {
  const context = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "transactions_create", context.member.user_id, { max: 60, windowMs: 60000 })) {
    throw tooManyRequests("Terlalu banyak permintaan. Coba lagi nanti.");
  }
  const body = await readJson(c, postTransactionSchema);
  const result = await postTransaction(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
    c.get("requestId"),
  );
  if (result.replayed) c.header("Idempotent-Replay", "true");
  return c.json(result);
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
  if (await checkRateLimit(c.env.DB, "transactions_void", context.member.user_id, { max: 20, windowMs: 60000 })) {
    throw tooManyRequests("Terlalu banyak permintaan. Coba lagi nanti.");
  }
  const body = await readJson(c, voidTransactionSchema);
  const transaction = await voidTransaction(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("transactionId"),
    body,
    c.get("requestId"),
  );
  return c.json({ transaction });
});

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}