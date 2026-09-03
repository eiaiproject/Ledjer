import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "5m", target: 50 },
    { duration: "30m", target: 50 },
    { duration: "5m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<3000", "p99<10000"],
    http_req_failed: ["rate<0.005"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
const COOKIE = __ENV.SESSION_COOKIE || "";

export default function () {
  const r = Math.random();
  if (r < 0.3) {
    http.get(`${BASE_URL}/`);
  } else if (r < 0.5) {
    http.get(`${BASE_URL}/api/transactions?limit=20`, { headers: { Cookie: COOKIE } });
  } else if (r < 0.7) {
    http.get(`${BASE_URL}/api/accounts`, { headers: { Cookie: COOKIE } });
  } else if (r < 0.85) {
    http.get(`${BASE_URL}/api/dashboard/summary`, { headers: { Cookie: COOKIE } });
  } else {
    http.get(`${BASE_URL}/api/reports/balance-sheet?asOfDate=2026-07-01`, { headers: { Cookie: COOKIE } });
  }
  sleep(3);
}
