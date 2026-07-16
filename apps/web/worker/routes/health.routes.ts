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

  if (!dbOk) {
    return c.json(
      { status: "unhealthy", database: "down" },
      503,
    );
  }

  return c.json({
    status: "healthy",
    database: "up",
  });
});
