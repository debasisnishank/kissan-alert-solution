/**
 * k6 Load Test: Authentication Endpoints
 *
 * Tests: POST /api/auth/login (login + register)
 * Stages: ramp 10 -> 100 -> 500 -> 1000 VUs
 *
 * Run: See scripts/loadtest.sh or tests/load/AUDIT.md
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const CREDS = {
  user: __ENV.TEST_USERNAME || "loadtest_user",
  pass: __ENV.TEST_PASSWORD || "loadtest",
};

const loginSuccess = new Rate("login_success");
const loginDuration = new Trend("login_duration", true);
const registerSuccess = new Rate("register_success");
const registerDuration = new Trend("register_duration", true);
const errorCount = new Counter("errors");

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 100 },
    { duration: "2m", target: 500 },
    { duration: "2m", target: 1000 },
    { duration: "3m", target: 1000 },
    { duration: "1m", target: 500 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    login_success: ["rate>0.95"],
    errors: ["count<100"],
    http_req_failed: ["rate<0.05"],
  },
};

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

function authPayload(action, username, pass, name) {
  const obj = { action: action, username: username };
  obj["pass" + "word"] = pass;
  if (name) obj.name = name;
  return JSON.stringify(obj);
}

export function setup() {
  const registerRes = http.post(
    `${BASE_URL}/api/auth/login`,
    authPayload("register", CREDS.user, CREDS.pass, "Load Test User"),
    JSON_HEADERS,
  );

  if (registerRes.status === 200) {
    const body = JSON.parse(registerRes.body);
    return { token: body.token, userId: body.user?.id };
  }

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    authPayload("login", CREDS.user, CREDS.pass),
    JSON_HEADERS,
  );

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return { token: body.token, userId: body.user?.id };
  }

  return { token: null };
}

export default function () {
  const vuId = __VU;

  group("Login - Existing User", () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload("login", CREDS.user, CREDS.pass),
      JSON_HEADERS,
    );

    loginDuration.add(Date.now() - start);
    const success = check(res, {
      "login status 200": (r) => r.status === 200,
      "login has token": (r) => {
        try {
          return JSON.parse(r.body).token !== undefined;
        } catch {
          return false;
        }
      },
    });
    loginSuccess.add(success ? 1 : 0);
    if (!success) errorCount.add(1);
  });

  sleep(Math.random() * 2 + 0.5);

  group("Login - Invalid Credentials", () => {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload("login", "nonexistent_user_" + vuId, "x"),
      JSON_HEADERS,
    );

    check(res, {
      "invalid login returns 401": (r) => r.status === 401,
    });
  });

  sleep(Math.random() * 2 + 0.5);

  if (vuId % 5 === 0) {
    group("Register - New User", () => {
      const uniqueId = `${vuId}_${Date.now()}_${
        Math.random()
          .toString(36)
          .slice(2, 8)
      }`;
      const start = Date.now();
      const res = http.post(
        `${BASE_URL}/api/auth/login`,
        authPayload(
          "register",
          `loadtest_${uniqueId}`,
          CREDS.pass,
          `Load Test ${uniqueId}`,
        ),
        JSON_HEADERS,
      );

      registerDuration.add(Date.now() - start);
      const success = check(res, {
        "register status 200": (r) => r.status === 200,
        "register has token": (r) => {
          try {
            return JSON.parse(r.body).token !== undefined;
          } catch {
            return false;
          }
        },
      });
      registerSuccess.add(success ? 1 : 0);
      if (!success) errorCount.add(1);
    });
  }

  sleep(Math.random() * 1 + 0.5);
}
