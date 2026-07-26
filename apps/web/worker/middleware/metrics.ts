import type { MiddlewareHandler, Context } from "hono";
import type { AppContext } from "../env";

/**
 * In-memory request counters and latency tracking. Reset on Worker restart.
 * Upgrade to D1-based persistent counters or external metrics sink when
 * observability infra matures.
 *
 * Tracks:
 * - Total requests, errors, auth failures
 * - Per-route request counts
 * - Per-route latency (P50, P95, P99 via histogram buckets)
 * - Report generation durations
 */

let requests = 0;
let errors = 0;
let authFailures = 0;

/** Histogram buckets (ms): 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 */
const BUCKET_BOUNDARIES = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

interface RouteStats {
  count: number;
  /** Histogram bucket counts for latency in ms */
  latencyBuckets: number[];
}

const routeStats = new Map<string, RouteStats>();

/** Report-specific timing durations in ms */
const reportDurations: number[] = [];

function getRouteKey(method: string, path: string): string {
  // Group by route pattern (strip dynamic segments like IDs)
  const normalized = path.replace(/\/[a-f0-9-]{20,}(?:\/|$)/g, "/:id/").replace(/\/[a-f0-9-]{20,}$/, "/:id");
  return `${method} ${normalized}`;
}

function recordLatency(routeKey: string, durationMs: number): void {
  let stats = routeStats.get(routeKey);
  if (!stats) {
    stats = { count: 0, latencyBuckets: new Array(BUCKET_BOUNDARIES.length + 1).fill(0) };
    routeStats.set(routeKey, stats);
  }
  stats.count++;

  // Assign to bucket
  let bucketIdx = BUCKET_BOUNDARIES.length; // overflow bucket
  for (let i = 0; i < BUCKET_BOUNDARIES.length; i++) {
    if (durationMs <= BUCKET_BOUNDARIES[i]) {
      bucketIdx = i;
      break;
    }
  }
  stats.latencyBuckets[bucketIdx]++;
}

function percentileFromBuckets(buckets: number[], pct: number): number {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const threshold = Math.ceil(total * pct / 100);
  let cumulative = 0;
  for (let i = 0; i < buckets.length; i++) {
    cumulative += buckets[i];
    if (cumulative >= threshold) {
      if (i < BUCKET_BOUNDARIES.length) return BUCKET_BOUNDARIES[i];
      return BUCKET_BOUNDARIES.at(-1)! * 2; // estimate for overflow
    }
  }
  return BUCKET_BOUNDARIES.at(-1)!;
}

export function getMetrics() {
  const routeSummaries: Record<string, { count: number; p50: number; p95: number; p99: number }> = {};
  for (const [key, stats] of routeStats.entries()) {
    routeSummaries[key] = {
      count: stats.count,
      p50: percentileFromBuckets(stats.latencyBuckets, 50),
      p95: percentileFromBuckets(stats.latencyBuckets, 95),
      p99: percentileFromBuckets(stats.latencyBuckets, 99),
    };
  }

  const reportStats = summarizeReportDurations();

  return {
    requests,
    errors,
    authFailures,
    routes: routeSummaries,
    reports: reportStats,
  };
}

export function recordReportDuration(durationMs: number): void {
  reportDurations.push(durationMs);
  // Keep only last 1000 samples
  if (reportDurations.length > 1000) {
    reportDurations.shift();
  }
}

function summarizeReportDurations() {
  if (reportDurations.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...reportDurations].sort((a, b) => a - b);
  const len = sorted.length;
  return {
    count: len,
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    max: sorted[len - 1],
  };
}

export function metricsMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    requests++;
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const routeKey = getRouteKey(c.req.method, new URL(c.req.url).pathname);
    recordLatency(routeKey, duration);

    const status = c.res.status;
    if (status >= 500) errors++;
    if (status === 401) authFailures++;
  };
}

/** Return metrics as JSON for monitoring endpoints. */
export function metricsHandler(c: Context<AppContext>) {
  return c.json(getMetrics());
}

/** Return detailed per-route metrics. */
export function detailedMetricsHandler(c: Context<AppContext>) {
  return c.json({
    ...getMetrics(),
    uptime: process.uptime ? Math.floor(process.uptime()) : undefined,
    bucketBoundaries: BUCKET_BOUNDARIES,
  });
}
