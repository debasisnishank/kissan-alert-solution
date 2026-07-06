import { Handlers } from "$fresh/server.ts";
import { execute } from "$db/client.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { videoId, liked } = await req.json();

      if (!videoId) {
        return Response.json(
          { error: "videoId is required" },
          { status: 400 },
        );
      }

      await execute(
        `INSERT INTO video_views (user_id, video_id, liked)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, video_id) DO UPDATE SET
           liked = EXCLUDED.liked`,
        [user.id, videoId, liked ?? true],
      );

      return Response.json({ success: true });
    } catch (error) {
      console.error("Reel like error:", error);
      return Response.json(
        { error: "Failed to record like" },
        { status: 500 },
      );
    }
  },
};
