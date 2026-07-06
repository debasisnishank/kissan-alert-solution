import { Handlers } from "$fresh/server.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        user: {
          id: ctx.state.user.id,
          name: ctx.state.user.name,
          phone: ctx.state.user.phone,
          email: ctx.state.user.email,
          role: ctx.state.user.role,
          language: ctx.state.user.language,
          avatarUrl: ctx.state.user.avatarUrl,
        },
        session: {
          tenantId: ctx.state.session.tenantId,
          role: ctx.state.session.role,
          permissions: ctx.state.session.permissions,
          expiresAt: ctx.state.session.expiresAt,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
