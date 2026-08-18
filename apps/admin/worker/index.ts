import { Hono } from "hono";
import type { AppContext } from "./env";
import { errorHandler } from "./middleware/error.middleware";
import { secureHeaders } from "hono/secure-headers";
import { requireAdminAuth } from "./middleware/admin-auth.middleware";
import { authRoutes } from "./routes/auth.routes";
import { usersRoutes } from "./routes/users.routes";
import { organizationsRoutes } from "./routes/organizations.routes";
import { auditLogsRoutes } from "./routes/audit-logs.routes";
import { monitoringRoutes } from "./routes/monitoring.routes";
import { backupsRoutes } from "./routes/backups.routes";
import { adminsRoutes } from "./routes/admins.routes";

const app = new Hono<AppContext>();

app.onError(errorHandler);
app.use("*", async (c, next) => {
  const requestId = c.req.header("X-Request-Id") || crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
});
app.use("*", requestLogger());
app.use("*", secureHeaders({}));

// Custom CSRF check with origin validation against APP_ORIGIN (same pattern
// as the main worker). The admin dashboard is a separate origin
// (https://admin.ledjer.id), so it needs its own allowlist.
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  if (c.env.APP_ENV === "development") return next();

  const origin = c.req.header("Origin") || c.req.header("Referer");
  const allowed = c.env.APP_ORIGIN;

  if (!origin) {
    const cookie = c.req.header("Cookie");
    if (cookie && (cookie.includes("ledjer_admin_session=") || cookie.includes("__Host-ledjer-admin_session="))) {
      if (allowed) {
        return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
      }
      return c.json({ error: { code: "csrf_missing_origin", message: "Missing Origin header with session cookie" } }, 403);
    }
    return next();
  }

  if (!allowed) {
    if (c.env.APP_ENV === "production") {
      return c.json({ error: { code: "csrf_misconfigured", message: "Server misconfigured" } }, 500);
    }
    return next();
  }

  const allowedList = allowed.split(",").map((o) => o.trim()).filter(Boolean);
  const ok = allowedList.some((a) => origin === a || origin.startsWith(a + "/"));
  if (!ok) return c.json({ error: { code: "csrf_invalid", message: "Origin not allowed" } }, 403);
  return next();
});

// Auth (login/logout/me) are public — session cookie is checked per-route.
app.route("/api/admin/auth", authRoutes);

// Everything below requires an authenticated admin session.
app.use("/api/admin/*", requireAdminAuth());
app.route("/api/admin/users", usersRoutes);
app.route("/api/admin/organizations", organizationsRoutes);
app.route("/api/admin/audit-logs", auditLogsRoutes);
app.route("/api/admin/monitoring", monitoringRoutes);
app.route("/api/admin/backups", backupsRoutes);
app.route("/api/admin/admins", adminsRoutes);

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
  return c.env.ASSETS.fetch(c.req.raw);
});

import { withSentry } from "@sentry/cloudflare";

const worker: ExportedHandler<AppContext["Bindings"]> = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
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

/** Structured JSON request logger. */
function requestLogger() {
  return async (c: { req: { method: string; url: string; header: (n: string) => string | undefined } }, next: () => Promise<void>) => {
    const start = Date.now();
    await next();
    if (c.req.url.includes("/api/health")) return;
    const url = new URL(c.req.url);
    const status = (c as unknown as { res: { status: number } }).res.status;
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      type: "request",
      method: c.req.method,
      path: url.pathname,
      status,
      duration: Date.now() - start,
      requestId: (c as unknown as { get: (k: string) => string }).get("requestId"),
      userAgent: c.req.header("User-Agent"),
    }));
  };
}
