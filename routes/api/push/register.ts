import { Handlers } from "$fresh/server.ts";
import { query } from "../../../db/client.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { token, platform } = await req.json();

      if (!token || !platform) {
        return Response.json(
          { error: "Token and platform are required" },
          { status: 400 },
        );
      }

      // Upsert push token
      await query(
        `INSERT INTO push_tokens (user_id, token, platform, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (token)
         DO UPDATE SET user_id = $1, platform = $3, updated_at = NOW()`,
        [user.id, token, platform],
      );

      return Response.json({ success: true });
    } catch (error) {
      console.error("Push register error:", error);
      return Response.json(
        { error: "Failed to register push token" },
        { status: 500 },
      );
    }
  },
};
