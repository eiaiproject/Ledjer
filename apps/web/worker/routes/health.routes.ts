import { Hono } from "hono";
import type { AppContext } from "../env";

export const healthRoutes = new Hono<AppContext>();

healthRoutes.get("/", async (c) => {
  const dbOk = await (async () => {
    try {
      const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return result?.ok === 1;
    } catch {
      return false;
    }
  })();

  return c.json({
    ok: true,
    service: "ledjer-api",
    runtime: "cloudflare-workers",
    db: dbOk ? "connected" : "error",
  });
});
