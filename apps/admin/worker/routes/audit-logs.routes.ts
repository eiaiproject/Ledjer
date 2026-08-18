import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { listAuditLogs } from "../services/admin-audit-logs.service";

const listQuerySchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
  organizationId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const auditLogsRoutes = new Hono<AppContext>();

auditLogsRoutes.get("/", async (c) => {
  const query = listQuerySchema.parse(c.req.query());
  const result = await listAuditLogs(c.env.DB, query);
  return c.json(result);
});
