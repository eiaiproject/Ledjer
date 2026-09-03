import { Hono } from "hono";
import type { AppContext } from "./env";
import { errorHandler } from "./middleware/error.middleware";

import { secureHeaders } from "hono/secure-headers";
import { requestLogger } from "./middleware/request-logger";
import { metricsMiddleware, metricsHandler, detailedMetricsHandler } from "./middleware/metrics";
import { accountsRoutes } from "./routes/accounts.routes";
import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { exportsRoutes } from "./routes/exports.routes";
import { healthRoutes } from "./routes/health.routes";
import { organizationRoutes } from "./routes/organization.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { transactionsRoutes } from "./routes/transactions.routes";
import { createBackup, runRestoreDrill } from "./services/backup.service";
import { cleanupExpiredRows } from "./services/maintenance.service";

const app = new Hono<AppContext>();

app.onError(errorHandler);
app.use("*", async (c, next) => {
  const requestId = c.req.header("X-Request-Id") || crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
});
app.use("*", requestLogger());
app.use("*", metricsMiddleware());
// CSP for static HTML SPA enforced via Cloudflare _headers file (single source of truth).
app.use("*", secureHeaders({}));
// Custom CSRF check with origin validation against APP_ORIGIN (ADR 0003).
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  // Fail-closed in production: reject state-changing requests whose Origin is
  // not in APP_ORIGIN, and Origin-less requests carrying a session cookie.
  const origin = c.req.header("Origin") || c.req.header("Referer");
  const allowed = c.env.APP_ORIGIN;

  if (c.env.APP_ENV === "development") return next();

  if (!origin) {
    const cookie = c.req.header("Cookie");
    if (cookie && (cookie.includes("ledjer_session=") || cookie.includes("__Host-ledjer_session="))) {
      if (allowed) {
        return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
      }
      return c.json({ error: { code: "csrf_missing_origin", message: "Missing Origin header with session cookie" } }, 403);
    }
    return next(); // No session cookie - public endpoint (health, login)
  }

  if (!allowed) {
    if (c.env.APP_ENV === "production") {
      return c.json({ error: { code: "csrf_misconfigured", message: "Server misconfigured" } }, 500);
    }
    return next();
  }

  const allowedList = allowed.split(",").map((o) => o.trim()).filter(Boolean);
  const ok = allowedList.some((a) => {
    if (origin === a) return true;
    try { return new URL(origin).origin === a; } catch { return false; }
  });
  if (!ok) return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
  return next();
});

app.route("/api/auth", authRoutes);
app.route("/api/health", healthRoutes);
app.get("/api/metrics", metricsHandler);
app.get("/api/metrics/detailed", detailedMetricsHandler);
app.route("/api/organizations", organizationRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/transactions", transactionsRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/exports", exportsRoutes);

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/")) {
    return c.json(
      {
        error: {
          code: "not_found",
          message: "API route not found",
          requestId: c.get("requestId"),
        },
      },
      404,
    );
  }
  // for hashed assets, return 404 (not SPA HTML) so the browser surfaces a
  // real missing-file error instead of a misleading MIME mismatch.
  if (path.startsWith("/assets/")) {
    return c.text("Not found", 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

import { withSentry } from "@sentry/cloudflare";

/** Create a daily backup and run restore drill, logging results. */
async function runBackupAndDrill(env: AppContext["Bindings"]): Promise<void> {
  try {
    if (!env.BACKUP_BUCKET) return;
    const manifest = await createBackup(env.DB, env.BACKUP_BUCKET);
    console.log(JSON.stringify({
      type: "backup",
      date: new Date(manifest.startedAt).toISOString().slice(0, 10),
      tables: Object.keys(manifest.tables).length,
      rows: Object.values(manifest.tables).reduce((s, t) => s + t.rowCount, 0),
      status: "completed",
    }));

    const drill = await runRestoreDrill(env.BACKUP_BUCKET);
    console.log(JSON.stringify({
      type: "restore_drill",
      date: drill.date,
      valid: drill.valid,
      errors: drill.errors.length > 0 ? drill.errors : undefined,
      tableCount: drill.tableCount,
      totalRows: drill.totalRows,
      duration: drill.duration,
      status: drill.valid ? "passed" : "failed",
    }));
  } catch (err) {
    console.error(JSON.stringify({ type: "backup", status: "failed", error: err instanceof Error ? err.message : String(err) }));
  }
}

const worker: ExportedHandler<AppContext["Bindings"]> = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(
    _controller: ScheduledController,
    env: AppContext["Bindings"],
  ) {
    await cleanupExpiredRows(env.DB);
    await runBackupAndDrill(env);
  },
};

const wrappedHandler = withSentry(
  (env: AppContext["Bindings"]) => {
    const dsn = env.SENTRY_DSN;
    if (!dsn) return { enabled: false };
    return {
      dsn,
      environment: env.APP_ENV ?? "development",
      release: env.GIT_SHA,
      tracesSampleRate: 0.1,
    };
  },
  worker,
);

export { app, wrappedHandler };
export default wrappedHandler;