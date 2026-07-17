import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 20 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<10000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
const COOKIE = __ENV.SESSION_COOKIE || "";

export default function () {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `${BASE_URL}/api/exports/transactions.csv?fromDate=2026-01-01&toDate=${today}`,
    `${BASE_URL}/api/exports/reports/trial-balance.csv?asOfDate=${today}`,
    `${BASE_URL}/api/exports/reports/general-ledger.csv?fromDate=2026-01-01&toDate=${today}`,
  ];
  for (const url of urls) {
    const res = http.get(url, { headers: { Cookie: COOKIE } });
    check(res, { "export status is 200 or 401": (r) => [200, 401].includes(r.status) });
    sleep(2);
  }
}
