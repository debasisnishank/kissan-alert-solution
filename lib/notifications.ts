import { query } from "$db/client.ts";
import { env } from "$utils/env.ts";

interface FCMMessage {
  token: string;
  notification?: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  android?: {
    notification?: {
      channel_id?: string;
      sound?: string;
      icon?: string;
      image?: string;
      click_action?: string;
    };
    priority?: string;
  };
  apns?: {
    payload?: {
      aps?: {
        sound?: string;
        "mutable-content"?: number;
        category?: string;
      };
    };
    fcm_options?: {
      image?: string;
    };
  };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }

  const email = env.FCM_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!email || !privateKeyPem) {
    throw new Error("FCM credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const b64url = (data: Uint8Array) =>
    btoa(String.fromCharCode(...data))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemBody = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      encoder.encode(signingInput),
    ),
  );

  const jwt = `${signingInput}.${b64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`FCM auth failed: ${err}`);
  }

  const data = await resp.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return data.access_token;
}

async function sendToFCM(message: FCMMessage): Promise<boolean> {
  const projectId = env.FCM_PROJECT_ID;
  if (!projectId) {
    console.warn("FCM_PROJECT_ID not set, skipping push");
    return false;
  }

  try {
    const accessToken = await getAccessToken();
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`FCM send failed: ${err}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("FCM send error:", err);
    return false;
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  const tokens = await query<{ token: string; platform: string }>(
    `SELECT token, platform FROM push_tokens WHERE user_id = $1`,
    [userId],
  );

  let sent = 0;
  let failed = 0;

  for (const t of tokens) {
    const msg: FCMMessage = {
      token: t.token,
      notification: {
        title,
        body,
        image: data?.imageUrl,
      },
      data: {
        ...data,
        title,
        body,
      },
      android: {
        priority: "high",
        notification: {
          channel_id: data?.channel || "default",
          sound: data?.sound || "default",
          icon: data?.icon || "ic_notification",
          image: data?.imageUrl,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: data?.sound || "default",
            "mutable-content": data?.imageUrl ? 1 : 0,
          },
        },
        fcm_options: data?.imageUrl ? { image: data.imageUrl } : undefined,
      },
    };

    const ok = await sendToFCM(msg);
    if (ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

export async function sendBulkNotification(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotification(userId, title, body, data);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { sent: totalSent, failed: totalFailed };
}

export async function sendToAllUsers(
  tenantId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  targetRole?: string,
): Promise<{ sent: number; failed: number; targeted: number }> {
  let q = `SELECT DISTINCT u.id FROM users u
           JOIN push_tokens pt ON pt.user_id = u.id
           WHERE u.tenant_id = $1 AND u.is_active = true`;
  const params: unknown[] = [tenantId];

  if (targetRole) {
    q += ` AND u.role = $2`;
    params.push(targetRole);
  }

  const users = await query<{ id: string }>(q, params);
  const result = await sendBulkNotification(
    users.map((u) => u.id),
    title,
    body,
    data,
  );

  return { ...result, targeted: users.length };
}
