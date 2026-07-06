import { FreshContext } from "$fresh/server.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import { query } from "$db/client.ts";

// Pages that don't require a farm
const NO_FARM_REQUIRED = [
  "/app/farm/add",
  "/app/onboarding",
  "/app/settings",
  "/app/help",
];

export async function handler(
  req: Request,
  ctx: FreshContext<AuthState>,
): Promise<Response> {
  // Check if user is logged in
  if (!ctx.state.session) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Skip farm check for certain pages
  if (NO_FARM_REQUIRED.some((p) => path.startsWith(p))) {
    return ctx.next();
  }

  // Check if user has at least one farm
  try {
    const farms = await query<{ id: string }>(
      `SELECT id FROM farms WHERE farmer_id = $1 AND tenant_id = $2 LIMIT 1`,
      [ctx.state.session.userId, ctx.state.session.tenantId],
    );

    if (farms.length === 0) {
      // Redirect to onboarding if no farms
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/onboarding" },
      });
    }
  } catch (error) {
    console.error("Farm check error:", error);
    // Continue even if check fails
  }

  return ctx.next();
}
