import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { forbidden } from "../http/errors";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(cOrigin: string, appOrigin?: string): Set<string> {
  const origins = new Set([cOrigin]);
  if (appOrigin) origins.add(appOrigin);
  return origins;
}

export function csrfProtection(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const cookie = c.req.header("Cookie");
    const origin = c.req.header("Origin");
    const referer = c.req.header("Referer");

    if (!cookie && !origin && !referer) {
      await next();
      return;
    }

    const requestOrigin = new URL(c.req.url).origin;
    const allowed = allowedOrigins(requestOrigin, c.env.APP_ORIGIN);

    if (origin && !allowed.has(origin)) {
      throw forbidden("csrf_origin_mismatch", "Invalid request origin");
    }

    if (!origin && referer) {
      const refererOrigin = new URL(referer).origin;
      if (!allowed.has(refererOrigin)) {
        throw forbidden("csrf_referer_mismatch", "Invalid request referer");
      }
    }

    await next();
  };
}
