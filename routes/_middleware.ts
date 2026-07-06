import { FreshContext } from "$fresh/server.ts";
import { authMiddleware, type AuthState } from "../middlewares/auth.ts";

// Security headers
function securityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
}

export async function handler(
  req: Request,
  ctx: FreshContext<AuthState>,
): Promise<Response> {
  // Run auth middleware
  const authResult = await authMiddleware(req, ctx);

  // If middleware returned a response (e.g., redirect), use it
  if (authResult instanceof Response) {
    return authResult;
  }

  // Continue to route handler
  const response = await ctx.next();

  // Add security headers
  securityHeaders(response.headers);

  return response;
}
