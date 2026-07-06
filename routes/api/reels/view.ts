import { Handlers } from "$fresh/server.ts";
import { execute } from "$db/client.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { videoId, watchedSeconds, completed } = await req.json();

      if (!videoId) {
        return Response.json(
          { error: "videoId is required" },
          { status: 400 },
        );
      }

      await execute(
        `INSERT INTO video_views (user_id, video_id, watched_seconds, completed)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, video_id) DO UPDATE SET
           watched_seconds = GREATEST(video_views.watched_seconds, EXCLUDED.watched_seconds),
           completed = video_views.completed OR EXCLUDED.completed,
           created_at = NOW()`,
        [user.id, videoId, watchedSeconds || 0, completed || false],
      );

      return Response.json({ success: true });
    } catch (error) {
      console.error("Reel view error:", error);
      return Response.json(
        { error: "Failed to record view" },
        { status: 500 },
      );
    }
  },
};
