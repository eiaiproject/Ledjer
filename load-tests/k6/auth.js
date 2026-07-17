import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "30s", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<3000"],
    http_req_failed: ["rate<0.02"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";

export default function () {
  const payload = JSON.stringify({
    email: `load-${__VU}@test.ledjer.id`,
    password: "LoadTestPass123!",
  });
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "status is 200 or 401": (r) => [200, 401].includes(r.status) });
  sleep(2);
}
