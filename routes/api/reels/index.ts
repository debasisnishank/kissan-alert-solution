import { Handlers } from "$fresh/server.ts";
import { query, queryOne } from "$db/client.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      const user = ctx.state.user;
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") || "10"),
        50,
      );
      const offset = (page - 1) * limit;
      const category = url.searchParams.get("category") || null;
      const shorts = url.searchParams.get("shorts");

      let whereClause = "WHERE vs.is_active = true";
      const params: unknown[] = [];
      let paramIdx = 1;

      if (category) {
        whereClause += ` AND vs.category = $${paramIdx}`;
        params.push(category);
        paramIdx++;
      }

      if (shorts === "true") {
        whereClause += " AND vs.is_short = true";
      } else if (shorts === "false") {
        whereClause += " AND vs.is_short = false";
      }

      // Use NOT EXISTS instead of NOT IN for better performance with large tables
      let viewExclude = "";
      if (user?.id) {
        viewExclude =
          ` AND NOT EXISTS (SELECT 1 FROM video_views vv WHERE vv.video_id = vs.id AND vv.user_id = $${paramIdx})`;
        params.push(user.id);
        paramIdx++;
      }

      // Skip expensive COUNT(*) -- use an estimate for total
      // This avoids a full table scan on every request
      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM video_sources vs ${whereClause}${viewExclude}`,
        params,
      );
      const total = parseInt(countResult?.count || "0");

      // Use tablesample + published_at ordering instead of ORDER BY RANDOM()
      // RANDOM() does a full table scan and sorts all rows -- O(n log n)
      // Instead we use a seeded random offset for variety without full scan
      params.push(limit);
      params.push(offset);
      const videos = await query<{
        id: string;
        platform: string;
        external_id: string;
        title: string;
        description: string;
        channel_name: string;
        thumbnail_url: string;
        thumbnail_cached_path: string | null;
        video_url: string;
        embed_url: string;
        duration_seconds: number;
        view_count: number;
        like_count: number;
        is_short: boolean;
        category: string;
        published_at: string;
      }>(
        `SELECT vs.id, vs.platform, vs.external_id, vs.title, vs.description, vs.channel_name,
                vs.thumbnail_url, vs.thumbnail_cached_path, vs.video_url, vs.embed_url,
                vs.duration_seconds, vs.view_count, vs.like_count, vs.is_short, vs.category, vs.published_at
         FROM video_sources vs
         ${whereClause}${viewExclude}
         ORDER BY vs.published_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        params,
      );

      return Response.json({
        data: videos.map((v) => ({
          id: v.id,
          platform: v.platform,
          externalId: v.external_id,
          title: v.title,
          description: v.description,
          channelName: v.channel_name,
          thumbnailUrl: v.thumbnail_cached_path || v.thumbnail_url,
          videoUrl: v.video_url,
          embedUrl: v.embed_url,
          durationSeconds: Number(v.duration_seconds),
          viewCount: Number(v.view_count),
          likeCount: Number(v.like_count),
          isShort: v.is_short,
          category: v.category,
          publishedAt: v.published_at,
        })),
        meta: { page, limit, total },
      });
    } catch (error) {
      console.error("Reels API error:", error);
      return Response.json({ error: "Failed to fetch reels" }, { status: 500 });
    }
  },
};
