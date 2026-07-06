import { Handlers } from "$fresh/server.ts";
import { query } from "../../../db/client.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { token } = await req.json();

      if (!token) {
        return Response.json({ error: "Token is required" }, { status: 400 });
      }

      // Delete push token
      await query(
        `DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`,
        [token, user.id],
      );

      return Response.json({ success: true });
    } catch (error) {
      console.error("Push unregister error:", error);
      return Response.json(
        { error: "Failed to unregister push token" },
        { status: 500 },
      );
    }
  },
};
