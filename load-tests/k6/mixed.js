import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "5m", target: 100 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
const COOKIE = __ENV.SESSION_COOKIE || "";

export default function () {
  const r = Math.random();
  if (r < 0.4) {
    // Read-heavy: landing page
    const res = http.get(BASE_URL, { headers: { Cookie: COOKIE } });
    check(res, { "landing status is 200": (r) => r.status === 200 });
  } else if (r < 0.7) {
    // Dashboard
    const res = http.get(`${BASE_URL}/api/dashboard`, { headers: { Cookie: COOKIE } });
    check(res, { "dashboard status is 200 or 401": (r) => [200, 401].includes(r.status) });
  } else if (r < 0.9) {
    // Transaction list
    const res = http.get(`${BASE_URL}/api/transactions?limit=20`, { headers: { Cookie: COOKIE } });
    check(res, { "txn list status is 200 or 401": (r) => [200, 401].includes(r.status) });
  } else {
    // CSV export
    const today = new Date().toISOString().slice(0, 10);
    const res = http.get(
      `${BASE_URL}/api/exports/reports/general-ledger.csv?fromDate=2026-01-01&toDate=${today}`,
      { headers: { Cookie: COOKIE } },
    );
    check(res, { "export status is 200 or 401": (r) => [200, 401].includes(r.status) });
  }
  sleep(1);
}
