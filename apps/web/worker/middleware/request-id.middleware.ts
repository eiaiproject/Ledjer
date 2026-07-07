import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";

export function requestId(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const requestId = c.req.header("CF-Ray") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  };
}
