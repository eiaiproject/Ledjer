import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppContext, Env } from "../env";
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from "./cookies";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("asset")),
    } as unknown as Fetcher,
    DB: {} as D1Database,
    APP_ORIGIN: "https://ledjer.id",
    ...overrides,
  };
}

describe("session cookies", () => {
  it("sets HttpOnly, Secure, SameSite=Lax session cookies", async () => {
    const app = new Hono<AppContext>();
    app.get("/set", (c) => {
      setSessionCookie(c, "session-token", Date.now() + 60_000);
      return c.text("ok");
    });

    const response = await app.fetch(new Request("https://ledjer.id/set"), testEnv());
    const cookie = response.headers.get("Set-Cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE}=session-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("clears the session cookie with the same security boundary", async () => {
    const app = new Hono<AppContext>();
    app.get("/clear", (c) => {
      clearSessionCookie(c);
      return c.text("ok");
    });

    const response = await app.fetch(new Request("https://ledjer.id/clear"), testEnv());
    const cookie = response.headers.get("Set-Cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });
});
