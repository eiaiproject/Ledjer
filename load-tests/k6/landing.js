import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p95<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const BASE_URL = __ENV.BASE_URL || "http://localhost:4173";
  const res = http.get(`${BASE_URL}/`);
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(1);
}
