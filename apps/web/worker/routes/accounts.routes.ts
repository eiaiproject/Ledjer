import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { readJson } from "../http/json";
import {
  createAccount,
  createCashBankAccount,
  listAccounts,
  patchAccount,
} from "../services/accounts.service";

const createCashBankSchema = z.object({
  subtype: z.enum(["cash", "bank"]),
  name: z.string().min(1).max(80),
});

const createAccountSchema = z.object({
  accountClass: z.enum(["income", "expense"]),
  name: z.string().min(1).max(80),
});

const patchAccountSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const accountsRoutes = new Hono<AppContext>();

accountsRoutes.use("*", requireAuth());

accountsRoutes.get("/", async (c) => {
  const url = new URL(c.req.url);
  const subtype = url.searchParams.get("subtype");
  const accounts = await listAccounts(c.env.DB, c.get("user").id, {
    includeInactive: url.searchParams.get("includeInactive") === "true",
    subtype: subtype === "cash" || subtype === "bank" ? subtype : undefined,
  });
  return c.json({ accounts });
});

accountsRoutes.post("/cash-bank", async (c) => {
  const body = await readJson(c, createCashBankSchema);
  const account = await createCashBankAccount(c.env.DB, c.get("user").id, body);
  return c.json({ account });
});

accountsRoutes.post("/", async (c) => {
  const body = await readJson(c, createAccountSchema);
  const account = await createAccount(c.env.DB, c.get("user").id, body);
  return c.json({ account });
});

accountsRoutes.patch("/:accountId", async (c) => {
  const body = await readJson(c, patchAccountSchema);
  const account = await patchAccount(
    c.env.DB,
    c.get("user").id,
    c.req.param("accountId"),
    body,
  );
  return c.json({ account });
});
