/**
 * YouTube Video Fetcher for Agricultural Reels
 *
 * Fetches agriculture/farming related videos from YouTube,
 * including both regular videos and Shorts.
 * Stores metadata and thumbnails for efficient API usage.
 */

import { execute, queryOne } from "$db/client.ts";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const SEARCH_QUERIES = [
  "Indian farming tips",
  "agriculture India",
  "organic farming India",
  "crop management techniques",
  "kisan kheti tips Hindi",
  "modern farming technology India",
  "vegetable farming India",
  "rice wheat cultivation tips",
  "pest control farming India",
  "soil health management",
  "drip irrigation India",
  "dairy farming India",
  "poultry farming tips",
  "mandi bhav crop prices",
  "government scheme farmers India",
];

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeVideoDetails {
  id: string;
  contentDetails: {
    duration: string;
  };
  statistics: {
    viewCount?: string;
    likeCount?: string;
  };
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

export async function fetchYouTubeVideos(apiKey: string): Promise<number> {
  if (!apiKey) {
    console.log("[YouTube] No API key provided, skipping");
    return 0;
  }

  let totalFetched = 0;
  const maxTotal = 100;

  // Pick a random subset of queries to diversify
  const shuffled = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);
  const selectedQueries = shuffled.slice(0, 5);

  for (const searchQuery of selectedQueries) {
    if (totalFetched >= maxTotal) break;

    try {
      // Check if we've recently fetched for this query
      const recentFetch = await queryOne<{ id: string }>(
        `SELECT id FROM video_fetch_log 
         WHERE platform = 'youtube' AND query_term = $1 
         AND created_at > NOW() - INTERVAL '12 hours'
         LIMIT 1`,
        [searchQuery],
      );

      // Get the next page token from last fetch if available
      let pageToken = "";
      if (recentFetch) {
        // Skip recently fetched queries
        continue;
      }

      const lastFetch = await queryOne<{ next_page_token: string | null }>(
        `SELECT next_page_token FROM video_fetch_log 
         WHERE platform = 'youtube' AND query_term = $1 
         ORDER BY created_at DESC LIMIT 1`,
        [searchQuery],
      );
      pageToken = lastFetch?.next_page_token || "";

      const remaining = maxTotal - totalFetched;
      const maxResults = Math.min(remaining, 20);

      // Search for videos
      const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
      searchUrl.searchParams.set("key", apiKey);
      searchUrl.searchParams.set("q", searchQuery);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("regionCode", "IN");
      searchUrl.searchParams.set("relevanceLanguage", "en");
      searchUrl.searchParams.set("order", "relevance");
      searchUrl.searchParams.set("videoCategoryId", "22"); // People & Blogs (farming often here)
      if (pageToken) {
        searchUrl.searchParams.set("pageToken", pageToken);
      }

      const searchRes = await fetch(searchUrl.toString());
      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error(
          `[YouTube] Search API error for "${searchQuery}": ${searchRes.status} ${errText}`,
        );
        continue;
      }

      const searchData = await searchRes.json();
      const items: YouTubeSearchItem[] = searchData.items || [];
      const nextPageToken = searchData.nextPageToken || null;

      if (items.length === 0) continue;

      // Get video details (duration, stats) in bulk
      const videoIds = items.map((i) => i.id.videoId).join(",");
      const detailsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
      detailsUrl.searchParams.set("key", apiKey);
      detailsUrl.searchParams.set("id", videoIds);
      detailsUrl.searchParams.set("part", "contentDetails,statistics");

      const detailsRes = await fetch(detailsUrl.toString());
      const detailsData = detailsRes.ok
        ? await detailsRes.json()
        : { items: [] };
      const detailsMap = new Map<string, YouTubeVideoDetails>();
      for (const d of (detailsData.items || [])) {
        detailsMap.set(d.id, d);
      }

      // Insert videos
      let batchInserted = 0;
      for (const item of items) {
        const videoId = item.id.videoId;
        const details = detailsMap.get(videoId);
        const duration = details
          ? parseDuration(details.contentDetails.duration)
          : 0;
        const isShort = duration > 0 && duration <= 60;
        const viewCount = details?.statistics?.viewCount
          ? parseInt(details.statistics.viewCount)
          : 0;
        const likeCount = details?.statistics?.likeCount
          ? parseInt(details.statistics.likeCount)
          : 0;

        const thumbnailUrl = item.snippet.thumbnails.high?.url ||
          item.snippet.thumbnails.medium?.url ||
          item.snippet.thumbnails.default?.url || "";

        try {
          await execute(
            `INSERT INTO video_sources (
              platform, external_id, title, description, channel_name, channel_id,
              thumbnail_url, video_url, embed_url, duration_seconds, view_count,
              like_count, published_at, tags, category, is_short, geo_region, metadata
            ) VALUES (
              'youtube', $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17
            )
            ON CONFLICT (platform, external_id) DO UPDATE SET
              view_count = EXCLUDED.view_count,
              like_count = EXCLUDED.like_count,
              updated_at = NOW()`,
            [
              videoId,
              item.snippet.title,
              item.snippet.description?.slice(0, 500) || "",
              item.snippet.channelTitle,
              item.snippet.channelId,
              thumbnailUrl,
              `https://www.youtube.com/watch?v=${videoId}`,
              `https://www.youtube.com/embed/${videoId}`,
              duration,
              viewCount,
              likeCount,
              item.snippet.publishedAt,
              `{${searchQuery.replace(/[{}]/g, "")}}`,
              "agriculture",
              isShort,
              "IN",
              JSON.stringify({ query: searchQuery }),
            ],
          );
          batchInserted++;
        } catch (err) {
          console.error(
            `[YouTube] Failed to insert video ${videoId}:`,
            err,
          );
        }
      }

      // Log this fetch
      await execute(
        `INSERT INTO video_fetch_log (platform, query_term, videos_fetched, next_page_token)
         VALUES ('youtube', $1, $2, $3)`,
        [searchQuery, batchInserted, nextPageToken],
      );

      totalFetched += batchInserted;
      console.log(
        `[YouTube] Fetched ${batchInserted} videos for "${searchQuery}"`,
      );

      // Small delay between queries to be kind to API
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[YouTube] Error fetching "${searchQuery}":`, err);
    }
  }

  // Also fetch Shorts specifically
  if (totalFetched < maxTotal) {
    try {
      const shortsQuery = "farming shorts India #shorts";
      const remaining = maxTotal - totalFetched;
      const maxResults = Math.min(remaining, 20);

      const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
      searchUrl.searchParams.set("key", apiKey);
      searchUrl.searchParams.set("q", shortsQuery);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("regionCode", "IN");
      searchUrl.searchParams.set("videoDuration", "short");
      searchUrl.searchParams.set("order", "date");

      const res = await fetch(searchUrl.toString());
      if (res.ok) {
        const data = await res.json();
        const items: YouTubeSearchItem[] = data.items || [];

        for (const item of items) {
          const videoId = item.id.videoId;
          const thumbnailUrl = item.snippet.thumbnails.high?.url ||
            item.snippet.thumbnails.medium?.url || "";

          try {
            await execute(
              `INSERT INTO video_sources (
                platform, external_id, title, description, channel_name, channel_id,
                thumbnail_url, video_url, embed_url, duration_seconds,
                published_at, tags, category, is_short, geo_region
              ) VALUES (
                'youtube', $1, $2, $3, $4, $5,
                $6, $7, $8, 60,
                $9, $10, 'agriculture', true, 'IN'
              ) ON CONFLICT (platform, external_id) DO NOTHING`,
              [
                videoId,
                item.snippet.title,
                item.snippet.description?.slice(0, 500) || "",
                item.snippet.channelTitle,
                item.snippet.channelId,
                thumbnailUrl,
                `https://www.youtube.com/shorts/${videoId}`,
                `https://www.youtube.com/embed/${videoId}`,
                item.snippet.publishedAt,
                "{farming,shorts,India}",
              ],
            );
            totalFetched++;
          } catch {
            // Skip duplicates
          }
        }
      }
    } catch (err) {
      console.error("[YouTube] Error fetching shorts:", err);
    }
  }

  console.log(`[YouTube] Total videos fetched: ${totalFetched}`);
  return totalFetched;
}
