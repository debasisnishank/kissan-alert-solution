import { Handlers } from "$fresh/server.ts";
import { execute } from "$db/client.ts";
import type { AuthState } from "../../../../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  async POST(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const allowedRoles = ["admin", "tenant_admin"];
    if (!allowedRoles.includes(session.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const farmId = ctx.params.id;

    await execute(
      `UPDATE farms SET is_verified = true, updated_at = NOW() 
       WHERE id = $1 AND tenant_id = $2`,
      [farmId, session.tenantId],
    );

    // Redirect back to farm detail page
    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/farms/${farmId}` },
    });
  },
};
