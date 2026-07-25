import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import { globalSearch } from "../services/global-search.service";

const app = new Hono<AppContext>();

// GET /api/search?q=keyword&limit=10
app.get("/", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const query = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") || "10", 10), 50);

  if (!query || query.trim().length < 2) {
    throw badRequest("query_too_short", "Kata kunci pencarian minimal 2 karakter");
  }

  const result = await globalSearch(c.env.DB, organization.id, query, limit);
  return c.json(result);
});

export default app;
