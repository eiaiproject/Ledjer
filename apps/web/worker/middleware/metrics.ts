import type { MiddlewareHandler, Context } from "hono";
import type { AppContext } from "../env";

/**
 * ponytail: In-memory request counters. Reset on Worker restart.
 * Upgrade to D1-based persistent counters or external metrics sink when
 * observability infra matures.
 */

let requests = 0;
let errors = 0;
let authFailures = 0;
export function getMetrics() {
  return { requests, errors, authFailures };
}

export function metricsMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    requests++;

    await next();

    const status = c.res.status;
    if (status >= 500) errors++;
    if (status === 401) authFailures++;
    // ponytail: DB failures tracked via the health endpoint, not per-request.
  };
}

/** Return metrics as JSON for monitoring endpoints. */
export function metricsHandler(c: Context<AppContext>) {
  return c.json(getMetrics());
}
