import { Hono } from "hono";
import type { AppContext } from "../env";

export const healthRoutes = new Hono<AppContext>();

healthRoutes.get("/", (c) => {
  return c.json({
    ok: true,
    service: "ledjer-api",
    runtime: "cloudflare-workers",
  });
});
