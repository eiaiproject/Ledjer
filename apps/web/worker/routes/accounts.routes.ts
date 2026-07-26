import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  createAccount,
  createCashBankAccount,
  deleteAccount,
  generateCashBankCode,
  getAccount,
  listAccounts,
  patchAccount,
  type CashBankKind,
} from "../services/accounts.service";

const cashBankKindSchema = z.enum(["cash", "bank", "qris", "ewallet"]);
const accountTypeSchema = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "cogs",
  "expense",
  "other_income",
  "other_expense",
]);
const normalBalanceSchema = z.enum(["debit", "credit"]);

const createCashBankSchema = z.object({
  kind: cashBankKindSchema,
  name: z.string().min(1).max(60),
});

const generateCodeSchema = z.object({
  kind: cashBankKindSchema,
});

const createAccountSchema = z.object({
  code: z.number().int().positive().optional(),
  name: z.string().min(1).max(60),
  accountType: accountTypeSchema,
  normalBalance: normalBalanceSchema,
  isCashAccount: z.boolean().optional(),
  cashAccountType: z.enum(["cash", "bank", "qris"]).optional(),
  reportGroup: z.string().max(80).optional(),
});

const patchAccountSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined, {
  message: "At least one field is required",
});

export const accountsRoutes = new Hono<AppContext>();

accountsRoutes.use("*", requireAuth());
accountsRoutes.use("*", loadCurrentOrganization());

accountsRoutes.get("/", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const accountTypes = parseAccountTypes(url.searchParams.get("accountTypes"));
  const activeParam = url.searchParams.get("active");
  let active: boolean | undefined;
  if (activeParam === "true") active = true;
  else if (activeParam === "false") active = false;
  const cashBankOnly = url.searchParams.get("kind") === "cash-bank";

  const accounts = await listAccounts(c.env.DB, context.organization.id, {
    active,
    cashBankOnly,
    accountTypes,
  });
  return c.json({ accounts });
});

accountsRoutes.get("/cash-bank", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const accounts = await listAccounts(c.env.DB, context.organization.id, {
    active: true,
    cashBankOnly: true,
  });
  return c.json({ accounts });
});

accountsRoutes.post("/cash-bank", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "accounts_create", context.member.user_id, { max: 10, windowMs: 60000 })) {
    throw tooManyRequests("Too many requests");
  }
  const body = await readJson(c, createCashBankSchema);
  const account = await createCashBankAccount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body.kind,
    body.name,
    c.get("requestId"),
  );
  return c.json({ account });
});

accountsRoutes.post("/generate-code", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, generateCodeSchema);
  const code = await generateCashBankCode(
    c.env.DB,
    context.organization.id,
    body.kind as CashBankKind,
  );
  return c.json({ code });
});

accountsRoutes.post("/", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "accounts_create", context.member.user_id, { max: 10, windowMs: 60000 })) {
    throw tooManyRequests("Too many requests");
  }
  const body = await readJson(c, createAccountSchema);
  const account = await createAccount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
    c.get("requestId"),
  );
  return c.json({ account });
});

accountsRoutes.get("/:accountId", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const account = await getAccount(
    c.env.DB,
    context.organization.id,
    c.req.param("accountId"),
  );
  return c.json({ account });
});

accountsRoutes.patch("/:accountId", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, patchAccountSchema);
  const account = await patchAccount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("accountId"),
    body,
    c.get("requestId"),
  );
  return c.json({ account });
});

accountsRoutes.delete("/:accountId", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  await deleteAccount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("accountId"),
    c.get("requestId"),
  );
  return c.body(null, 204);
});

function parseAccountTypes(value: string | null) {
  if (!value) return undefined;
  const parsed = z.array(accountTypeSchema).safeParse(value.split(","));
  return parsed.success ? parsed.data : undefined;
}
