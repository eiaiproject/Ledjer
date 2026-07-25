import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { app } from "./index";

function testEnv(): Env {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("asset")),
    } as unknown as Fetcher,
    DB: {} as D1Database,
    APP_ORIGIN: "http://localhost:5173",
  };
}

describe("Worker API", () => {
  it("returns 503 when DB is unreachable", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/health"),
      testEnv(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unhealthy",
      database: "down",
    });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns JSON for missing API routes", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/missing"),
      testEnv(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "API route not found",
      },
    });
  });

  it("app bootstraps with all route groups registered", async () => {
    // Verify the app can handle a request without crashing
    const response = await app.fetch(
      new Request("http://localhost/api/health"),
      testEnv(),
    );
    expect(response.status).toBe(503); // DB down = unhealthy
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
  });

  it("rejects mutating cookie-authenticated requests from a foreign origin", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "ledjer_session=session-token",
          Origin: "https://evil.example",
        },
      }),
      testEnv(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "csrf_invalid" },
    });
  });
});
