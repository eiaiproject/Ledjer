import { Hono } from "hono";
import type { AppContext } from "./env";
import { errorHandler } from "./middleware/error.middleware";

import { secureHeaders } from "hono/secure-headers";
import { requestLogger } from "./middleware/request-logger";
import { metricsMiddleware, metricsHandler, detailedMetricsHandler } from "./middleware/metrics";
import openingBalanceRoutes from "./routes/opening-balance.routes";
import { accountsRoutes } from "./routes/accounts.routes";
import { auditLogsRoutes } from "./routes/audit-logs.routes";
import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { exportsRoutes } from "./routes/exports.routes";
import { healthRoutes } from "./routes/health.routes";
import globalSearchRoutes from "./routes/global-search.routes";
import { inventoryRoutes } from "./routes/inventory.routes";
import { organizationRoutes } from "./routes/organization.routes";
import { partiesRoutes } from "./routes/parties.routes";
import { periodLocksRoutes } from "./routes/period-locks.routes";
import { productsRoutes } from "./routes/products.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { teamRoutes } from "./routes/team.routes";
import { transactionsRoutes } from "./routes/transactions.routes";
import attachmentRoutes from "./routes/attachments.routes";
import invoiceRoutes from "./routes/invoices.routes";
import receivablesRoutes from "./routes/receivables.routes";
import reconciliationRoutes from "./routes/reconciliation.routes";
import importRoutes from "./routes/import.routes";
import notificationRoutes from "./routes/notifications.routes";
import { manualJournalRoutes } from "./routes/manual-journals.routes";
import { pushRoutes } from "./routes/push.routes";
import { onboardingRoutes } from "./routes/onboarding.routes";
import { createBackup, runRestoreDrill } from "./services/backup.service";
import { cleanupExpiredRows } from "./services/maintenance.service";
import { cleanupOrphanedAttachments } from "./services/attachments.service";

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
// ponytail: CSP for static HTML SPA enforced via Cloudflare _headers file.
// Worker does not set CSP headers — _headers is the single source of truth.
// API JSON responses don't need CSP (no HTML execution context).
app.use("*", secureHeaders({}));
// ponytail: Custom CSRF check with origin validation against APP_ORIGIN.
// Built-in csrf() can't access c.env at config time.
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  // ponytail 2.3: In production, if APP_ORIGIN is unset, throw at boot (fail-closed).
  // For state-changing methods, if Origin header is missing AND the request has
  // a session cookie, reject with 403. Same-origin browser requests always send
  // Origin on mutations. Allow Origin-less requests only when no session cookie
  // is present (e.g. public health check, login endpoint pre-auth).
  const origin = c.req.header("Origin") || c.req.header("Referer");
  const allowed = c.env.APP_ORIGIN;

  // Local builds (vite preview, wrangler dev) run with APP_ENV=development
  // via vite.config.ts customizer / .dev.vars — trust the local origin.
  if (c.env.APP_ENV === "development") return next();

  if (!origin) {
    const cookie = c.req.header("Cookie");
    if (cookie && (cookie.includes("ledjer_session=") || cookie.includes("__Host-ledjer_session="))) {
      if (allowed) {
        return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
      }
      return c.json({ error: { code: "csrf_missing_origin", message: "Missing Origin header with session cookie" } }, 403);
    }
    return next(); // No session cookie — public endpoint (health, login)
  }

  if (!allowed) {
    // In production, APP_ORIGIN must be configured — deny all origins if missing
    if (c.env.APP_ENV === "production") {
      return c.json({ error: { code: "csrf_misconfigured", message: "Server misconfigured" } }, 500);
    }
    return next(); // dev mode: allow all
  }
  // ponytail: accept comma-separated origins (e.g. "http://localhost:5173,http://localhost:4173").
  const allowedList = allowed.split(",").map((o) => o.trim()).filter(Boolean);
  const ok = allowedList.some((a) => origin === a || origin.startsWith(a + "/"));
  if (!ok) return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
  return next();
});

app.route("/api/audit-logs", auditLogsRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/health", healthRoutes);
app.get("/api/metrics", metricsHandler);
app.get("/api/metrics/detailed", detailedMetricsHandler);
app.route("/api/search", globalSearchRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/organizations", organizationRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/parties", partiesRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/transactions", transactionsRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/exports", exportsRoutes);
app.route("/api/period-locks", periodLocksRoutes);
app.route("/api/opening-balance", openingBalanceRoutes);
app.route("/api/attachments", attachmentRoutes);
app.route("/api/reconciliation", reconciliationRoutes);
app.route("/api/invoices", invoiceRoutes);
app.route("/api/receivables", receivablesRoutes);
app.route("/api/import", importRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/manual-journals", manualJournalRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/onboarding", onboardingRoutes);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
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

  return c.env.ASSETS.fetch(c.req.raw);
});

import { withSentry } from "@sentry/cloudflare";

// ponytail: wrappedHandler wraps the Hono app with Sentry for Cloudflare Workers.
// Tests import { app } directly (unwrapped) so they don't need ExecutionContext.
/** Run attachment retention cleanup and log results. */
async function runAttachmentCleanup(env: AppContext["Bindings"]): Promise<void> {
  try {
    if (!env.BACKUP_BUCKET) return;
    const result = await cleanupOrphanedAttachments(env.DB, env.BACKUP_BUCKET);
    if (result.orphaned > 0 || result.expired > 0 || result.r2Orphans > 0) {
      console.log(JSON.stringify({ type: "attachment_cleanup", ...result, status: "completed" }));
    }
  } catch (err) {
    console.error(JSON.stringify({ type: "attachment_cleanup", status: "failed", error: err instanceof Error ? err.message : String(err) }));
  }
}



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
    await runAttachmentCleanup(env);
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
