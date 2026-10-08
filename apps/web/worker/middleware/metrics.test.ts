import { describe, it, expect } from "vitest";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { metricsMiddleware, getMetrics, MAX_ROUTE_KEYS } from "./metrics";

async function hit(path: string, status = 404): Promise<void> {
  const mw = metricsMiddleware();
  const c = {
    req: { method: "GET", url: `http://localhost${path}` },
    res: { status },
  } as unknown as Context<AppContext>;
  await mw(c, async () => {});
}

describe("metrics route cardinality", () => {
  it("caps distinct route keys at MAX_ROUTE_KEYS", async () => {
    for (let i = 0; i < MAX_ROUTE_KEYS + 50; i++) {
      await hit(`/probe-${i}/x`);
    }
    const m = getMetrics();
    expect(Object.keys(m.routes).length).toBeLessThanOrEqual(MAX_ROUTE_KEYS);
  });

  it("normalizes long hex ids to :id", async () => {
    await hit(`/api/transactions/${"a".repeat(24)}`);
    expect(Object.keys(getMetrics().routes)).toContain("GET /api/transactions/:id/");
  });
});
