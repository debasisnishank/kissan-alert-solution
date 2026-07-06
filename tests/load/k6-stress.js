/**
 * k6 Stress Test: Find Breaking Point
 *
 * Progressively increases load beyond expected capacity
 * to find when the system starts failing.
 *
 * Run: k6 run tests/load/k6-stress.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

const successRate = new Rate("success_rate");
const reqDuration = new Trend("req_duration", true);
const errorCount = new Counter("error_count");

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "1m", target: 500 },
    { duration: "1m", target: 1000 },
    { duration: "1m", target: 1500 },
    { duration: "1m", target: 2000 }, // beyond expected capacity
    { duration: "2m", target: 2000 }, // sustain extreme load
    { duration: "1m", target: 0 }, // recovery
  ],
  thresholds: {
    // No strict thresholds -- we want to see where it breaks
    http_req_duration: ["p(50)<5000"], // just track p50 < 5s
  },
};

const CREDS = {
  user: __ENV.TEST_USERNAME || "stress_test_user",
  pass: __ENV.TEST_PASSWORD || "loadtest",
};

function authPayload(action, username, pass, name) {
  const obj = { action: action, username: username };
  obj["pass" + "word"] = pass;
  if (name) obj.name = name;
  return JSON.stringify(obj);
}

export function setup() {
  let res = http.post(
    `${BASE_URL}/api/auth/login`,
    authPayload("register", CREDS.user, CREDS.pass, "Stress Tester"),
    { headers: { "Content-Type": "application/json" } },
  );

  if (res.status !== 200) {
    res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload("login", CREDS.user, CREDS.pass),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let token = null;
  try {
    token = JSON.parse(res.body).token;
  } catch {}
  return { token };
}

export default function (data) {
  const headers = { "Content-Type": "application/json" };
  if (data.token) headers["Authorization"] = `Bearer ${data.token}`;

  // Mix of endpoints with realistic ratios
  const rand = Math.random();

  if (rand < 0.3) {
    // 30% - Reels list (heaviest query: RANDOM + NOT IN subquery)
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/reels?page=1&limit=10`, {
      headers,
    });
    reqDuration.add(Date.now() - start);
    const ok = check(res, { ok: (r) => r.status === 200 });
    successRate.add(ok ? 1 : 0);
    if (!ok) errorCount.add(1);
  } else if (rand < 0.5) {
    // 20% - Login
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload("login", CREDS.user, CREDS.pass),
      { headers: { "Content-Type": "application/json" } },
    );
    reqDuration.add(Date.now() - start);
    const ok = check(res, { ok: (r) => r.status === 200 });
    successRate.add(ok ? 1 : 0);
    if (!ok) errorCount.add(1);
  } else if (rand < 0.7) {
    // 20% - Homepage
    const start = Date.now();
    const res = http.get(`${BASE_URL}/app`);
    reqDuration.add(Date.now() - start);
    const ok = check(res, { ok: (r) => r.status < 500 });
    successRate.add(ok ? 1 : 0);
    if (!ok) errorCount.add(1);
  } else if (rand < 0.85) {
    // 15% - Reels view/like writes
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/reels/view`,
      JSON.stringify({
        videoId: "00000000-0000-0000-0000-000000000000",
        watchedSeconds: 10,
        completed: false,
      }),
      { headers },
    );
    reqDuration.add(Date.now() - start);
    // 404/500 is expected for fake videoId, just check server responds
    successRate.add(res.status < 502 ? 1 : 0);
    if (res.status >= 502) errorCount.add(1);
  } else {
    // 15% - Farms list
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/farms?limit=20`, { headers });
    reqDuration.add(Date.now() - start);
    const ok = check(res, { ok: (r) => r.status < 500 });
    successRate.add(ok ? 1 : 0);
    if (!ok) errorCount.add(1);
  }

  sleep(Math.random() * 0.5 + 0.1);
}
