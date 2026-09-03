import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { readJson } from "../http/json";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import {
  createCashBankAccount,
  listAccounts,
  patchAccount,
} from "../services/accounts.service";

const createCashBankSchema = z.object({
  subtype: z.enum(["cash", "bank"]),
  name: z.string().min(1).max(80),
});

const patchAccountSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const accountsRoutes = new Hono<AppContext>();

accountsRoutes.use("*", requireAuth());
accountsRoutes.use("*", loadCurrentOrganization());

accountsRoutes.get("/", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const subtype = url.searchParams.get("subtype");
  const accounts = await listAccounts(c.env.DB, context.organization.id, {
    includeInactive: url.searchParams.get("includeInactive") === "true",
    subtype: subtype === "cash" || subtype === "bank" ? subtype : undefined,
  });
  return c.json({ accounts });
});

accountsRoutes.post("/cash-bank", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createCashBankSchema);
  const account = await createCashBankAccount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
  );
  return c.json({ account });
});

accountsRoutes.patch("/:accountId", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, patchAccountSchema);
  const account = await patchAccount(
    c.env.DB,
    context.organization.id,
    c.req.param("accountId"),
    context.member.user_id,
    body,
  );
  return c.json({ account });
});