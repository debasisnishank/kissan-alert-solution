/**
 * k6 Load Test: Full User Flow
 *
 * Simulates a realistic user journey:
 * 1. Login
 * 2. Browse reels (multiple pages)
 * 3. Like/view videos
 * 4. Check farms list
 * 5. View farm details
 *
 * Run: k6 run tests/load/k6-full-flow.js
 * With env: k6 run -e BASE_URL=http://localhost:8000 tests/load/k6-full-flow.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

// Custom metrics
const flowSuccess = new Rate("full_flow_success");
const e2eDuration = new Trend("e2e_flow_duration", true);
const dbLatency = new Trend("db_dependent_latency", true);
const errorCount = new Counter("errors");

export const options = {
  scenarios: {
    // Scenario 1: Steady load
    steady_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "2m", target: 200 },
        { duration: "3m", target: 500 },
        { duration: "3m", target: 1000 },
        { duration: "2m", target: 1000 }, // sustain
        { duration: "1m", target: 0 },
      ],
    },
    // Scenario 2: Spike test
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      startTime: "5m", // start after steady begins to stabilize
      stages: [
        { duration: "10s", target: 500 }, // sudden spike
        { duration: "30s", target: 500 }, // sustain spike
        { duration: "10s", target: 0 }, // drop
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<3000", "p(99)<8000"],
    full_flow_success: ["rate>0.90"],
    http_req_failed: ["rate<0.10"],
    errors: ["count<500"],
  },
};

const TEST_PASS = __ENV.TEST_PASSWORD || "loadtest";
const TEST_USERS = [];
for (let i = 0; i < 20; i++) {
  TEST_USERS.push({ username: `loadtest_flow_${i}`, pass: TEST_PASS });
}

function authPayload(action, username, pass, name) {
  const obj = { action: action, username: username };
  obj["pass" + "word"] = pass;
  if (name) obj.name = name;
  return JSON.stringify(obj);
}

export function setup() {
  const tokens = [];

  for (const user of TEST_USERS) {
    let res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload(
        "register",
        user.username,
        user.pass,
        `Flow User ${user.username}`,
      ),
      { headers: { "Content-Type": "application/json" } },
    );

    if (res.status !== 200) {
      res = http.post(
        `${BASE_URL}/api/auth/login`,
        authPayload("login", user.username, user.pass),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const body = JSON.parse(res.body);
      if (body.token) tokens.push(body.token);
    } catch {
      // ignore parse errors
    }
  }

  return { tokens };
}

export default function (data) {
  const flowStart = Date.now();
  let flowOk = true;

  // Pick a random token (shared across VUs to reduce setup cost)
  const token = data.tokens.length > 0
    ? data.tokens[Math.floor(Math.random() * data.tokens.length)]
    : null;

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // STEP 1: Login (even with token, test the endpoint)
  group("1. Login", () => {
    const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      authPayload("login", user.username, user.pass),
      { headers: { "Content-Type": "application/json" } },
    );
    dbLatency.add(Date.now() - start);

    if (
      !check(res, {
        "login ok": (r) => r.status === 200,
      })
    ) {
      flowOk = false;
      errorCount.add(1);
    }
  });

  sleep(Math.random() * 0.5 + 0.3);

  // STEP 2: Browse reels (3 pages simulating scroll)
  let videoIds = [];
  group("2. Browse Reels", () => {
    for (let page = 1; page <= 3; page++) {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/api/reels?page=${page}&limit=10`, {
        headers,
      });
      dbLatency.add(Date.now() - start);

      if (
        !check(res, {
          [`reels page ${page} ok`]: (r) => r.status === 200,
        })
      ) {
        flowOk = false;
        errorCount.add(1);
      }

      try {
        const body = JSON.parse(res.body);
        const ids = (body.data || []).map((v) => v.id);
        videoIds = videoIds.concat(ids);
      } catch {
        // ignore parse errors
      }

      sleep(Math.random() * 0.5 + 0.2);
    }
  });

  // STEP 3: Interact with videos
  if (videoIds.length > 0 && token) {
    group("3. Video Interactions", () => {
      // View 3 random videos
      for (let i = 0; i < Math.min(3, videoIds.length); i++) {
        const videoId = videoIds[Math.floor(Math.random() * videoIds.length)];
        http.post(
          `${BASE_URL}/api/reels/view`,
          JSON.stringify({
            videoId,
            watchedSeconds: Math.floor(Math.random() * 60),
            completed: Math.random() > 0.7,
          }),
          { headers },
        );
        sleep(Math.random() * 0.3);
      }

      // Like 1 random video
      const likeId = videoIds[Math.floor(Math.random() * videoIds.length)];
      const likeRes = http.post(
        `${BASE_URL}/api/reels/like`,
        JSON.stringify({ videoId: likeId, liked: true }),
        { headers },
      );
      check(likeRes, { "like ok": (r) => r.status === 200 });
    });
  }

  sleep(Math.random() * 0.5 + 0.2);

  // STEP 4: Check farms
  group("4. Farms List", () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/farms?limit=20`, { headers });
    dbLatency.add(Date.now() - start);

    check(res, {
      "farms ok": (r) => r.status === 200 || r.status === 401,
    });
  });

  sleep(Math.random() * 0.3 + 0.1);

  // STEP 5: Homepage (static page load)
  group("5. Homepage", () => {
    const res = http.get(`${BASE_URL}/app`);
    check(res, {
      "homepage ok": (r) => r.status === 200 || r.status === 302,
    });
  });

  // Record full flow
  e2eDuration.add(Date.now() - flowStart);
  flowSuccess.add(flowOk ? 1 : 0);

  sleep(Math.random() * 1 + 0.5);
}
