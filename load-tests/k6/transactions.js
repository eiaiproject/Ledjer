import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";

export default function () {
  const payload = JSON.stringify({
    transactionDate: "2026-07-17",
    transactionType: "cash_sale",
    amount: 50000,
    cashAccountId: __ENV.CASH_ACCOUNT_ID || "",
    description: "Load test transaction",
    idempotencyKey: `load-test-${__VU}-${__ITER}`,
  });

  const res = http.post(`${BASE_URL}/api/transactions`, payload, {
    headers: { "Content-Type": "application/json", Cookie: __ENV.SESSION_COOKIE || "" },
  });
  check(res, { "status is 200 or 401": (r) => [200, 401].includes(r.status) });
  sleep(1);
}
