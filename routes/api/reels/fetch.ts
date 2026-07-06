import { Handlers } from "$fresh/server.ts";
import { env } from "$utils/env.ts";
import { queryOne } from "$db/client.ts";

export const handler: Handlers = {
  async POST(_req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Check if we already have videos
      const existing = await queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM video_sources WHERE is_active = true",
        [],
      );
      const existingCount = parseInt(existing?.count || "0");

      if (existingCount > 0) {
        return Response.json({
          status: "already_populated",
          count: existingCount,
        });
      }

      if (!env.YOUTUBE_API_KEY) {
        return Response.json(
          { error: "YouTube API key not configured" },
          { status: 503 },
        );
      }

      const { fetchYouTubeVideos } = await import(
        "$lib/videos/youtube.ts"
      );
      const fetched = await fetchYouTubeVideos(env.YOUTUBE_API_KEY);

      // Facebook (optional)
      let fbFetched = 0;
      if (env.FACEBOOK_PAGE_ACCESS_TOKEN && env.FACEBOOK_PAGE_IDS) {
        const { fetchFacebookVideos } = await import(
          "$lib/videos/facebook.ts"
        );
        const pageIds = env.FACEBOOK_PAGE_IDS.split(",").map((s: string) =>
          s.trim()
        ).filter(Boolean);
        if (pageIds.length > 0) {
          fbFetched = await fetchFacebookVideos(
            env.FACEBOOK_PAGE_ACCESS_TOKEN,
            pageIds,
          );
        }
      }

      return Response.json({
        status: "fetched",
        youtube: fetched,
        facebook: fbFetched,
        total: fetched + fbFetched,
      });
    } catch (error) {
      console.error("Reels fetch error:", error);
      return Response.json(
        { error: "Failed to fetch reels" },
        { status: 500 },
      );
    }
  },
};
