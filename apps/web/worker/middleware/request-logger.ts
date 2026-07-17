import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";

/**
 * Structured JSON request logger middleware.
 *
 * Logs: method, path, status, duration, requestId, version, env.
 * Never logs: headers, cookies, Authorization, body, query params,
 * or any data that could contain PII or secrets.
 *
 * Usage in index.ts:
 *   app.use("*", requestLogger());
 */
export function requestLogger(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const url = new URL(c.req.url);
    const path = url.pathname;
    const query = url.searchParams.toString();

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const requestId = c.get("requestId") ?? "unknown";

    // Build structured log entry
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      method,
      path,
      query: query || undefined,
      status,
      duration,
      requestId,
      env: c.env.APP_ENV ?? "development",
    };

    // Include version if available (not a secret)
    if (c.env.GIT_SHA) {
      entry.version = c.env.GIT_SHA;
    }

    // Never log: organization_id, user_id, email, session tokens, body, headers
    console.log(JSON.stringify(entry));
  };
}
