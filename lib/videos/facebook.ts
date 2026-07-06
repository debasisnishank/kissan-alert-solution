/**
 * Facebook Video Fetcher for Agricultural Reels
 *
 * Only enabled when FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_IDS are set.
 * Fetches videos from specified Facebook Pages about agriculture.
 */

import { execute, queryOne } from "$db/client.ts";

const FB_GRAPH_API = "https://graph.facebook.com/v19.0";

interface FBVideoItem {
  id: string;
  title?: string;
  description?: string;
  source?: string;
  permalink_url?: string;
  thumbnails?: { data: Array<{ uri: string }> };
  length?: number;
  created_time?: string;
  from?: { name: string; id: string };
}

export async function fetchFacebookVideos(
  accessToken: string,
  pageIds: string[],
): Promise<number> {
  if (!accessToken || pageIds.length === 0) {
    console.log("[Facebook] No access token or page IDs, skipping");
    return 0;
  }

  let totalFetched = 0;
  const maxTotal = 50;

  for (const pageId of pageIds) {
    if (totalFetched >= maxTotal) break;

    try {
      // Check recent fetch
      const recentFetch = await queryOne<{ id: string }>(
        `SELECT id FROM video_fetch_log 
         WHERE platform = 'facebook' AND query_term = $1 
         AND created_at > NOW() - INTERVAL '12 hours'
         LIMIT 1`,
        [pageId],
      );

      if (recentFetch) continue;

      const remaining = maxTotal - totalFetched;
      const limit = Math.min(remaining, 25);

      const url = new URL(`${FB_GRAPH_API}/${pageId}/videos`);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set(
        "fields",
        "id,title,description,source,permalink_url,thumbnails,length,created_time,from",
      );
      url.searchParams.set("limit", String(limit));

      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error(
          `[Facebook] API error for page ${pageId}: ${res.status}`,
        );
        continue;
      }

      const data = await res.json();
      const items: FBVideoItem[] = data.data || [];

      let batchInserted = 0;
      for (const item of items) {
        const thumbnailUrl = item.thumbnails?.data?.[0]?.uri || "";
        const videoUrl = item.permalink_url ||
          `https://www.facebook.com/${pageId}/videos/${item.id}`;
        const isShort = (item.length || 0) <= 60;

        try {
          await execute(
            `INSERT INTO video_sources (
              platform, external_id, title, description, channel_name, channel_id,
              thumbnail_url, video_url, embed_url, duration_seconds,
              published_at, tags, category, is_short, geo_region
            ) VALUES (
              'facebook', $1, $2, $3, $4, $5,
              $6, $7, $8, $9,
              $10, $11, 'agriculture', $12, 'IN'
            ) ON CONFLICT (platform, external_id) DO UPDATE SET
              updated_at = NOW()`,
            [
              item.id,
              item.title || "Untitled",
              item.description?.slice(0, 500) || "",
              item.from?.name || "",
              item.from?.id || pageId,
              thumbnailUrl,
              videoUrl,
              `https://www.facebook.com/plugins/video.php?href=${
                encodeURIComponent(videoUrl)
              }`,
              item.length || 0,
              item.created_time || new Date().toISOString(),
              "{agriculture,farming,facebook}",
              isShort,
            ],
          );
          batchInserted++;
        } catch (err) {
          console.error(
            `[Facebook] Failed to insert video ${item.id}:`,
            err,
          );
        }
      }

      // Log this fetch
      await execute(
        `INSERT INTO video_fetch_log (platform, query_term, videos_fetched)
         VALUES ('facebook', $1, $2)`,
        [pageId, batchInserted],
      );

      totalFetched += batchInserted;
      console.log(
        `[Facebook] Fetched ${batchInserted} videos from page ${pageId}`,
      );
    } catch (err) {
      console.error(`[Facebook] Error fetching page ${pageId}:`, err);
    }
  }

  console.log(`[Facebook] Total videos fetched: ${totalFetched}`);
  return totalFetched;
}
