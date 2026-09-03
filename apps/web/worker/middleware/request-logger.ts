import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";

/**
 * Structured JSON request logger middleware.
 *
 * Logs the request lifecycle plus the registered route pattern (e.g.
 * "/api/transactions/:id"), which is a code-defined constant - never the raw
 * URL path or query string, because those are user-controlled input and must
 * not be written to logs (tssecurity:S5145). Route-level aggregates are also
 * covered by the metrics middleware, and error logs share the same requestId
 * for correlation.
 *
 * Usage in index.ts:
 *   app.use("*", requestLogger());
 */
export function requestLogger(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const requestId = c.get("requestId") ?? "unknown";

    // Resolve the registered route pattern (code-defined, e.g.
    // "/api/transactions/:id") instead of the raw URL path. matchedRoutes
    // holds only server-registered patterns, never user input; routeIndex
    // points at the handler that produced the response (404 requests match
    // only the "/*" middleware, which is dropped).
    const matched = c.req.matchedRoutes[c.req.routeIndex];
    const route = matched && !matched.path.includes("*") ? matched.path : undefined;

    // Build structured log entry
    let level: string;
    if (status >= 500) {
      level = "error";
    } else if (status >= 400) {
      level = "warn";
    } else {
      level = "info";
    }

    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      method,
      route,
      status,
      duration,
      requestId,
      env: c.env.APP_ENV ?? "development",
    };

    // Include version if available (not a secret)
    if (c.env.GIT_SHA) {
      entry.version = c.env.GIT_SHA;
    }

    // Never log: raw URL path, query string, organization_id, user_id,
    // email, session tokens, body, headers - any user-controlled data.
    console.log(JSON.stringify(entry));
  };
}
