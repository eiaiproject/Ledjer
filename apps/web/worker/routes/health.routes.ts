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

/** Readiness check — verifies all upstream dependencies. */
healthRoutes.get("/ready", async (c) => {
  const checks: Record<string, string> = {};
  let allOk = true;

  // DB
  try {
    const r = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    checks.database = r?.ok === 1 ? "up" : "error";
    if (r?.ok !== 1) allOk = false;
  } catch {
    checks.database = "down";
    allOk = false;
  }

  // Sentry DSN configured (not validating the endpoint)
  checks.sentry = c.env.SENTRY_DSN ? "configured" : "not-configured";

  return c.json(
    { status: allOk ? "ready" : "degraded", checks },
    allOk ? 200 : 503,
  );
});
