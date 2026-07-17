import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 5 },
    { duration: "1m", target: 20 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
const COOKIE = __ENV.SESSION_COOKIE || "";
const PRODUCT_ID = __ENV.PRODUCT_ID || "";
const CASH_ACCOUNT_ID = __ENV.CASH_ACCOUNT_ID || "";

export default function () {
  const payload = JSON.stringify({
    transactionDate: "2026-07-01",
    transactionType: "cash_sale",
    amount: 10000,
    cashAccountId: CASH_ACCOUNT_ID,
    productId: PRODUCT_ID,
    description: `Concurrent stock test VU=${__VU} iter=${__ITER}`,
    idempotencyKey: `concurrent-${__VU}-${__ITER}`,
  });
  const res = http.post(`${BASE_URL}/api/transactions`, payload, {
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
  });
  check(res, { "sale status is 200 or 401": (r) => [200, 401].includes(r.status) });
  sleep(1);
}
