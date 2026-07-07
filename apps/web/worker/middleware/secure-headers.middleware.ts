import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function secureHeaders(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      c.header(name, value);
    }

    await next();
  };
}
