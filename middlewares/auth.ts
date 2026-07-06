import { FreshContext } from "$fresh/server.ts";
import { validateSessionWithUser } from "$lib/auth.ts";
import type { Session, User } from "$utils/types.ts";

export interface AuthState {
  session: Session | null;
  user: User | null;
}

const SESSION_COOKIE = "compass_session";

export function getSessionToken(req: Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookies = req.headers.get("Cookie");
  if (cookies) {
    const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match) return match[1];
  }

  return null;
}

// Only mark the cookie Secure when the app is actually served over HTTPS —
// browsers silently drop Secure cookies on plain-HTTP non-localhost origins
// (e.g. accessing the dev server via a LAN IP from a phone).
function cookieFlags(): string {
  const isHttps = (Deno.env.get("APP_URL") || "").startsWith("https://");
  return `HttpOnly;${isHttps ? " Secure;" : ""} SameSite=Lax; Path=/`;
}

export function setSessionCookie(headers: Headers, token: string): void {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; ${cookieFlags()}; Max-Age=${maxAge}`,
  );
}

export function clearSessionCookie(headers: Headers): void {
  headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${cookieFlags()}; Max-Age=0`,
  );
}

export async function authMiddleware(
  req: Request,
  ctx: FreshContext<AuthState>,
) {
  const token = getSessionToken(req);

  if (token) {
    const result = await validateSessionWithUser(token);
    if (result) {
      ctx.state.session = result.session;
      ctx.state.user = result.user;
    } else {
      ctx.state.session = null;
      ctx.state.user = null;
    }
  } else {
    ctx.state.session = null;
    ctx.state.user = null;
  }

  return ctx.next();
}

export function requireAuth(
  _req: Request,
  ctx: FreshContext<AuthState>,
): Response | null {
  if (!ctx.state.session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export function requireRole(
  ctx: FreshContext<AuthState>,
  roles: string[],
): Response | null {
  if (!ctx.state.session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!roles.includes(ctx.state.session.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

export function requirePermission(
  ctx: FreshContext<AuthState>,
  permission: string,
): Response | null {
  if (!ctx.state.session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ctx.state.session.permissions.includes(permission)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
