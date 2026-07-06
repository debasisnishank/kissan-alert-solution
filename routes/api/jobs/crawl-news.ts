import { Handlers } from "$fresh/server.ts";
import { crawlAllSources, getLatestNews } from "$lib/news/crawler.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  // Get latest news
  async GET(req, _ctx) {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    try {
      const news = await getLatestNews({ category, limit, offset });
      return new Response(JSON.stringify({ data: news }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching news:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch news" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },

  // Trigger news crawl (admin only)
  async POST(req, ctx) {
    // Check for API key in header (for cron jobs) or admin permission
    const apiKey = req.headers.get("X-API-Key");
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (apiKey && cronSecret && apiKey === cronSecret) {
      // Valid cron job request
    } else {
      // Check for admin permission
      const authError = requirePermission(ctx, PERMISSIONS.ADMIN);
      if (authError) return authError;
    }

    try {
      console.log("[News API] Starting crawl...");
      const result = await crawlAllSources();

      return new Response(
        JSON.stringify({
          success: true,
          message:
            `Crawled ${result.sources} sources, fetched ${result.fetched} articles, saved ${result.saved} new`,
          data: result,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error crawling news:", error);
      return new Response(
        JSON.stringify({ error: "Failed to crawl news" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
