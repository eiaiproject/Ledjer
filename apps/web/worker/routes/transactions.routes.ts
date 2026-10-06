import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { parseListLimit, parseListOffset, parseSearch } from "../http/params";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { badRequest, tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  countTransactions,
  getTransaction,
  listTransactions,
  postTransaction,
  voidTransaction,
} from "../services/transactions.service";

const transactionTypeSchema = z.enum(["cash_in", "cash_out", "transfer", "owner_deposit", "owner_withdrawal", "purchase"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  // Satuan boleh pecahan (maks 4 desimal, mis. 500000/252) agar total tercatat
  // persis sama dengan nominal yang diketik — bukan hasil satuan-bulat × qty.
  unitCostIdr: z.number().finite().nonnegative().optional(),
  unitPriceIdr: z.number().finite().nonnegative().optional(),
});

const postTransactionSchema = z.object({
  transactionType: transactionTypeSchema,
  transactionDate: dateSchema,
  cashAccountId: z.string().min(1),
  counterAccountId: z.string().min(1).optional(),
  amountIdr: z.number().int().positive().max(999_999_999_999).optional(),
  description: z.string().min(1).max(200),
  idempotencyKey: z.string().min(8).max(160),
  items: z.array(transactionItemSchema).max(100).optional(),
});

const voidTransactionSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export const transactionsRoutes = new Hono<AppContext>();

transactionsRoutes.use("*", requireAuth());

const LIST_TYPE_WHITELIST = new Set(["cash_in", "cash_out", "transfer", "owner_deposit", "owner_withdrawal", "purchase"]);
const LIST_STATUS_WHITELIST = new Set(["posted", "voided"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validasi format tanggal query dan urutan from-to (throw 400 bila invalid). */
export function assertDateRange(rawFrom: string | undefined, rawTo: string | undefined): void {
  if ((rawFrom !== undefined && !DATE_RE.test(rawFrom)) || (rawTo !== undefined && !DATE_RE.test(rawTo))) {
    throw badRequest("invalid_date", "Format tanggal harus YYYY-MM-DD.");
  }
  if (rawFrom && rawTo && rawFrom > rawTo) {
    throw badRequest("invalid_date_range", "fromDate tidak boleh setelah toDate.");
  }
}

transactionsRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const url = new URL(c.req.url);
  const rawType = url.searchParams.get("transactionType") ?? undefined;
  const rawStatus = url.searchParams.get("status") ?? undefined;
  const rawFrom = url.searchParams.get("fromDate") ?? undefined;
  const rawTo = url.searchParams.get("toDate") ?? undefined;
  assertDateRange(rawFrom, rawTo);
  const filters = {
    search: parseSearch(url.searchParams.get("search")),
    transactionType: rawType && LIST_TYPE_WHITELIST.has(rawType) ? rawType : undefined,
    status: rawStatus && LIST_STATUS_WHITELIST.has(rawStatus) ? rawStatus : undefined,
    fromDate: rawFrom,
    toDate: rawTo,
    limit: parseListLimit(url.searchParams.get("limit")),
    offset: parseListOffset(url.searchParams.get("offset")),
  };
  const [transactions, total] = await Promise.all([
    listTransactions(c.env.DB, userId, filters),
    countTransactions(c.env.DB, userId, filters),
  ]);
  return c.json({ transactions, total });
});

transactionsRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  if (await checkRateLimit(c.env.DB, "transactions_create", userId, { max: 60, windowMs: 60000 })) {
    throw tooManyRequests("Terlalu banyak permintaan. Coba lagi nanti.");
  }
  const body = await readJson(c, postTransactionSchema);
  const result = await postTransaction(c.env.DB, userId, body, c.get("requestId"));
  if (result.replayed) c.header("Idempotent-Replay", "true");
  return c.json(result);
});

transactionsRoutes.get("/:transactionId", async (c) => {
  const transaction = await getTransaction(
    c.env.DB,
    c.get("user").id,
    c.req.param("transactionId"),
  );
  return c.json({ transaction });
});

transactionsRoutes.post("/:transactionId/void", async (c) => {
  const userId = c.get("user").id;
  if (await checkRateLimit(c.env.DB, "transactions_void", userId, { max: 20, windowMs: 60000 })) {
    throw tooManyRequests("Terlalu banyak permintaan. Coba lagi nanti.");
  }
  const body = await readJson(c, voidTransactionSchema);
  const transaction = await voidTransaction(
    c.env.DB,
    userId,
    c.req.param("transactionId"),
    body,
    c.get("requestId"),
  );
  return c.json({ transaction });
});
