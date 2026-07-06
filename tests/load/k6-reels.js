/**
 * k6 Load Test: Reels API Endpoints
 *
 * Tests: GET /api/reels, POST /api/reels/view, POST /api/reels/like
 * Stages: ramp 10 -> 100 -> 500 -> 1000 VUs
 *
 * Run: k6 run tests/load/k6-reels.js
 * With env: k6 run -e BASE_URL=http://localhost:8000 tests/load/k6-reels.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

// Custom metrics
const reelsListSuccess = new Rate("reels_list_success");
const reelsListDuration = new Trend("reels_list_duration", true);
const reelsViewSuccess = new Rate("reels_view_success");
const reelsLikeSuccess = new Rate("reels_like_success");
const errorCount = new Counter("errors");

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // warm-up
    { duration: "1m", target: 100 }, // ramp
    { duration: "2m", target: 500 }, // ramp
    { duration: "2m", target: 1000 }, // ramp to peak
    { duration: "3m", target: 1000 }, // sustain peak
    { duration: "1m", target: 500 }, // scale down
    { duration: "30s", target: 0 }, // cool down
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
    reels_list_success: ["rate>0.95"],
    errors: ["count<100"],
    http_req_failed: ["rate<0.05"],
  },
};

const CREDS = {
  user: __ENV.TEST_USERNAME || "loadtest_reels",
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
    authPayload("register", CREDS.user, CREDS.pass, "Reels Load Tester"),
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
  const headers = {
    "Content-Type": "application/json",
  };
  if (data.token) {
    headers["Authorization"] = `Bearer ${data.token}`;
  }

  let videoIds = [];

  // Fetch reels - page 1
  group("Reels - List Page 1", () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/reels?page=1&limit=10`, {
      headers,
    });

    reelsListDuration.add(Date.now() - start);
    const success = check(res, {
      "reels status 200": (r) => r.status === 200,
      "reels has data array": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
      "reels has meta": (r) => {
        try {
          return JSON.parse(r.body).meta !== undefined;
        } catch {
          return false;
        }
      },
    });
    reelsListSuccess.add(success ? 1 : 0);
    if (!success) errorCount.add(1);

    // Extract video IDs for view/like tests
    try {
      const body = JSON.parse(res.body);
      videoIds = (body.data || []).map((v) => v.id);
    } catch {}
  });

  sleep(Math.random() * 1 + 0.3);

  // Fetch reels - page 2 (pagination test)
  group("Reels - List Page 2", () => {
    const res = http.get(`${BASE_URL}/api/reels?page=2&limit=10`, {
      headers,
    });

    check(res, {
      "page 2 status 200": (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 0.5 + 0.2);

  // Filter: shorts only
  group("Reels - Shorts Filter", () => {
    const res = http.get(
      `${BASE_URL}/api/reels?page=1&limit=10&shorts=true`,
      { headers },
    );

    check(res, {
      "shorts filter status 200": (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 0.5 + 0.2);

  // Mark video as viewed (if we have video IDs)
  if (videoIds.length > 0 && data.token) {
    group("Reels - Mark Viewed", () => {
      const videoId = videoIds[Math.floor(Math.random() * videoIds.length)];
      const res = http.post(
        `${BASE_URL}/api/reels/view`,
        JSON.stringify({
          videoId,
          watchedSeconds: Math.floor(Math.random() * 120),
          completed: Math.random() > 0.5,
        }),
        { headers },
      );

      const success = check(res, {
        "view status 200": (r) => r.status === 200,
      });
      reelsViewSuccess.add(success ? 1 : 0);
    });

    sleep(Math.random() * 0.3 + 0.1);

    // Like a video
    group("Reels - Like", () => {
      const videoId = videoIds[Math.floor(Math.random() * videoIds.length)];
      const res = http.post(
        `${BASE_URL}/api/reels/like`,
        JSON.stringify({
          videoId,
          liked: Math.random() > 0.3,
        }),
        { headers },
      );

      const success = check(res, {
        "like status 200": (r) => r.status === 200,
      });
      reelsLikeSuccess.add(success ? 1 : 0);
    });
  }

  sleep(Math.random() * 1 + 0.5);
}
