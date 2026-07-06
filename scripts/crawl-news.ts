#!/usr/bin/env -S deno run -A
/**
 * News Crawler Script
 * Run this 3 times daily via cron or scheduled task
 *
 * Usage:
 *   deno run -A scripts/crawl-news.ts
 *
 * Cron example (runs at 6am, 12pm, 6pm IST):
 *   0 6,12,18 * * * cd /path/to/compass-deno && deno run -A scripts/crawl-news.ts
 */

import { load } from "$std/dotenv/mod.ts";

// Load environment variables
await load({ allowEmptyValues: true, export: true });

// Dynamic import to ensure env is loaded first
const { crawlAllSources } = await import("../lib/news/crawler.ts");

console.log("=".repeat(50));
console.log(`News Crawler started at ${new Date().toISOString()}`);
console.log("=".repeat(50));

try {
  const result = await crawlAllSources();

  console.log("\n" + "=".repeat(50));
  console.log("CRAWL SUMMARY");
  console.log("=".repeat(50));
  console.log(`Sources processed: ${result.sources}`);
  console.log(`Articles fetched:  ${result.fetched}`);
  console.log(`New articles saved: ${result.saved}`);
  console.log(`Completed at: ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  Deno.exit(0);
} catch (error) {
  console.error("Crawl failed:", error);
  Deno.exit(1);
}
