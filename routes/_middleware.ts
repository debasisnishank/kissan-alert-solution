import { FreshContext } from "$fresh/server.ts";
import { authMiddleware, type AuthState } from "../middlewares/auth.ts";

// Security headers
function securityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Empty allowlists (`camera=()`) block the feature entirely, even for the
  // page's own same-origin JS -- the crop-scan camera and voice logger both
  // need `self` here, not just third-party embeds locked out.
  headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self)",
  );
}

const STATIC_ASSET_RE = /\.(css|png|jpg|jpeg|svg|ico|json|webmanifest)$/;

// Static assets aren't content-hashed, so avoid `immutable`; a short max-age
// with stale-while-revalidate skips the round-trip on repeat loads while
// still picking up changes soon after a deploy.
function cacheHeaders(pathname: string, headers: Headers): void {
  if (pathname === "/sw.js") {
    headers.set("Cache-Control", "no-cache");
  } else if (STATIC_ASSET_RE.test(pathname)) {
    headers.set(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=86400",
    );
  }
}

export async function handler(
  req: Request,
  ctx: FreshContext<AuthState>,
): Promise<Response> {
  // Populate ctx.state.session/user for downstream handlers
  await authMiddleware(req, ctx);

  // Continue to route handler
  const response = await ctx.next();

  // Add security headers
  securityHeaders(response.headers);
  if (req.method === "GET" && response.status === 200) {
    cacheHeaders(new URL(req.url).pathname, response.headers);
  }

  return response;
}
