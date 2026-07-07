/**
 * Initialize KV Queue handlers for Deno Deploy
 */

import { registerHandler, startQueueListener } from "./kv-queue.ts";

export async function initQueueHandlers(): Promise<void> {
  // Register all job handlers
  registerHandler("ingest_satellite_catalog", async (payload) => {
    const { handleIngestSatelliteCatalog } = await import(
      "./handlers/ingest_satellite.ts"
    );
    await handleIngestSatelliteCatalog(payload);
  });

  registerHandler("extract_farm_features", async (payload) => {
    const { handleExtractFarmFeatures } = await import(
      "./handlers/extract_features.ts"
    );
    await handleExtractFarmFeatures(payload);
  });

  registerHandler("generate_advisories", async (payload) => {
    const { handleGenerateAdvisories } = await import(
      "./handlers/generate_advisories.ts"
    );
    await handleGenerateAdvisories(payload);
  });

  registerHandler("sync_market_prices", async (payload) => {
    const { handleSyncMarketPrices } = await import(
      "./handlers/sync_market_prices.ts"
    );
    await handleSyncMarketPrices(payload);
  });

  registerHandler("crawl_news", async () => {
    const { crawlAllSources } = await import("../lib/news/crawler.ts");
    await crawlAllSources();
  });

  registerHandler("analyze_farm", async (payload) => {
    const farmId = payload.farmId as string;
    if (!farmId) throw new Error("farmId required");

    const { handleExtractFarmFeatures } = await import(
      "./handlers/extract_features.ts"
    );
    await handleExtractFarmFeatures({ farmId });
  });

  registerHandler("send_notification", async (payload) => {
    const { sendPushNotification } = await import("../lib/notifications.ts");
    await sendPushNotification(
      payload.userId as string,
      payload.title as string,
      payload.body as string,
      payload.data as Record<string, string> | undefined,
    );
  });

  // Start the queue listener
  await startQueueListener();

  console.log("[QUEUE] All handlers registered and listener started");
}
