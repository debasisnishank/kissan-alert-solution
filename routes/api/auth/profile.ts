import { Handlers } from "$fresh/server.ts";
import { execute } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  // Update profile
  async PUT(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const { name, email } = await req.json();

      if (!name || name.trim().length < 2) {
        return new Response(
          JSON.stringify({ error: "Name must be at least 2 characters" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Validate email format if provided
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(
          JSON.stringify({ error: "Invalid email format" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      await execute(
        `UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3`,
        [name.trim(), email?.trim() || null, ctx.state.user.id],
      );

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Profile update error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update profile" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
