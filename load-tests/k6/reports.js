import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 40 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
const COOKIE = __ENV.SESSION_COOKIE || "";

export default function () {
  const today = new Date().toISOString().slice(0, 10);
  const endpoints = [
    `${BASE_URL}/api/reports/profit-loss?fromDate=2026-01-01&toDate=${today}`,
    `${BASE_URL}/api/reports/balance-sheet?asOfDate=${today}`,
  ];
  for (const url of endpoints) {
    const res = http.get(url, { headers: { Cookie: COOKIE } });
    check(res, { "report status is 200 or 401": (r) => [200, 401].includes(r.status) });
    sleep(1);
  }
}
