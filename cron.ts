// Deno Cron Jobs for Khetscope Agricultural Platform
// These run automatically on Deno Deploy
//
// Cron syntax: "minute hour day month weekday"
// Examples:
//   "0 6 * * *"     = Daily at 6:00 AM
//   "0 0/15 * * *"  = Every 15 minutes
//   "0 0/2 * * *"   = Every 2 hours

// News Crawler - 3 times daily (6 AM, 12 PM, 6 PM IST = 0:30, 6:30, 12:30 UTC)
Deno.cron("crawl-news", "30 0,6,12 * * *", async () => {
  console.log("[CRON] Starting news crawl...");
  try {
    const { crawlAllSources } = await import("./lib/news/crawler.ts");
    const result = await crawlAllSources();
    console.log(
      `[CRON] News crawl complete: ${result.fetched} fetched, ${result.saved} new`,
    );
  } catch (error) {
    console.error("[CRON] News crawl failed:", error);
  }
});

// Satellite Data Ingestion - Every 6 hours
Deno.cron("ingest-satellite", "0 */6 * * *", async () => {
  console.log("[CRON] Starting satellite data ingestion...");
  try {
    const { handleIngestSatelliteCatalog } = await import(
      "./workers/handlers/ingest_satellite.ts"
    );
    await handleIngestSatelliteCatalog({});
    console.log("[CRON] Satellite ingestion complete");
  } catch (error) {
    console.error("[CRON] Satellite ingestion failed:", error);
  }
});

// Farm Features Extraction - Every 4 hours
Deno.cron("extract-features", "0 */4 * * *", async () => {
  console.log("[CRON] Starting farm features extraction...");
  try {
    const { query } = await import("./db/client.ts");
    const { handleExtractFarmFeatures } = await import(
      "./workers/handlers/extract_features.ts"
    );

    // Get farms that need feature extraction (no observations in last 3 days)
    const farms = await query<{ id: string }>(
      `SELECT id FROM farms 
       WHERE id NOT IN (
         SELECT DISTINCT farm_id FROM farm_observations 
         WHERE observation_date > NOW() - INTERVAL '3 days'
       )
       LIMIT 50`,
      [],
    );

    const { onReportReady } = await import("./lib/farm-events.ts");

    for (const farm of farms) {
      try {
        await handleExtractFarmFeatures({ farmId: farm.id });
        // Notify farmer that satellite report is updated
        onReportReady(farm.id, {
          type: "satellite",
          summary:
            "New satellite imagery has been processed for your farm. Check updated NDVI and health scores.",
        }).catch(() => {});
      } catch (e) {
        console.error(
          `[CRON] Feature extraction failed for farm ${farm.id}:`,
          e,
        );
      }
    }
    console.log(`[CRON] Features extracted for ${farms.length} farms`);
  } catch (error) {
    console.error("[CRON] Feature extraction failed:", error);
  }
});

// Generate Advisories - Every 2 hours
Deno.cron("generate-advisories", "0 */2 * * *", async () => {
  console.log("[CRON] Starting advisory generation...");
  try {
    const { query } = await import("./db/client.ts");
    const { handleGenerateAdvisories } = await import(
      "./workers/handlers/generate_advisories.ts"
    );

    // Get farms with active crops
    const farms = await query<{ id: string; farmer_id: string }>(
      `SELECT f.id, f.farmer_id FROM farms f
       INNER JOIN crop_declarations cd ON cd.farm_id = f.id
       WHERE cd.is_active = true
       AND f.id NOT IN (
         SELECT DISTINCT farm_id FROM farm_alerts 
         WHERE created_at > NOW() - INTERVAL '6 hours'
       )
       LIMIT 100`,
      [],
    );

    for (const farm of farms) {
      try {
        await handleGenerateAdvisories({
          farmId: farm.id,
          farmerId: farm.farmer_id,
        });
      } catch (e) {
        console.error(
          `[CRON] Advisory generation failed for farm ${farm.id}:`,
          e,
        );
      }
    }
    console.log(`[CRON] Advisories generated for ${farms.length} farms`);
  } catch (error) {
    console.error("[CRON] Advisory generation failed:", error);
  }
});

// Market Prices Sync - Daily at 8 AM IST (2:30 UTC)
Deno.cron("sync-market-prices", "30 2 * * *", async () => {
  console.log("[CRON] Starting market prices sync...");
  try {
    const { handleSyncMarketPrices } = await import(
      "./workers/handlers/sync_market_prices.ts"
    );
    await handleSyncMarketPrices({});
    console.log("[CRON] Market prices sync complete");
  } catch (error) {
    console.error("[CRON] Market prices sync failed:", error);
  }
});

// Cleanup Old Data - Daily at 2 AM IST (20:30 UTC previous day)
Deno.cron("cleanup-old-data", "30 20 * * *", async () => {
  console.log("[CRON] Starting data cleanup...");
  try {
    const { execute } = await import("./db/client.ts");

    // Clean up old news (30 days)
    const newsDeleted = await execute(
      `DELETE FROM news_articles WHERE published_at < NOW() - INTERVAL '30 days'`,
      [],
    );
    console.log(`[CRON] Deleted ${newsDeleted} old news articles`);

    // Clean up old audit log entries (90 days)
    const auditDeleted = await execute(
      `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days'`,
      [],
    );
    console.log(`[CRON] Deleted ${auditDeleted} old audit log entries`);

    console.log("[CRON] Cleanup complete");
  } catch (error) {
    console.error("[CRON] Cleanup failed:", error);
  }
});

// Weather Data Update - Every 3 hours
Deno.cron("update-weather", "0 */3 * * *", async () => {
  console.log("[CRON] Starting weather data update...");
  try {
    const { query } = await import("./db/client.ts");
    const { getDailyWeather } = await import("./lib/satellite/weather.ts");

    const { onWeatherUpdate } = await import("./lib/farm-events.ts");

    // Get unique farm locations
    const farms = await query<{
      id: string;
      lat: number;
      lon: number;
    }>(
      `SELECT DISTINCT ON (
         ROUND(ST_Y(ST_Centroid(polygon::geometry))::numeric, 2),
         ROUND(ST_X(ST_Centroid(polygon::geometry))::numeric, 2)
       )
       id,
       ST_Y(ST_Centroid(polygon::geometry)) as lat,
       ST_X(ST_Centroid(polygon::geometry)) as lon
       FROM farms
       WHERE polygon IS NOT NULL
       LIMIT 100`,
      [],
    );

    let updated = 0;
    const today = new Date();
    const startDate = today.toISOString().split("T")[0];
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    for (const farm of farms) {
      try {
        const weatherData = await getDailyWeather({
          lat: farm.lat,
          lon: farm.lon,
          startDate,
          endDate,
        });
        updated++;

        if (weatherData && weatherData.length > 0) {
          const totalRainfall = weatherData.reduce(
            (sum, d) => sum + d.precipitation,
            0,
          );
          const maxTemp = Math.max(...weatherData.map((d) => d.temperatureMax));
          const minTemp = Math.min(...weatherData.map((d) => d.temperatureMin));

          onWeatherUpdate(farm.id, {
            rainfall7d: totalRainfall,
            tempMax: maxTemp,
            tempMin: minTemp,
            description: `7-day forecast: ${totalRainfall.toFixed(0)}mm rain, ${
              maxTemp.toFixed(0)
            }°C max`,
          }).catch(() => {});
        }
      } catch {
        // Weather API failures are common, just skip
      }
    }
    console.log(`[CRON] Weather updated for ${updated} locations`);
  } catch (error) {
    console.error("[CRON] Weather update failed:", error);
  }
});

console.log("[CRON] Deno cron jobs registered:");
console.log("  - crawl-news: 6:00, 12:00, 18:00 IST");
console.log("  - ingest-satellite: Every 6 hours");
console.log("  - extract-features: Every 4 hours");
console.log("  - generate-advisories: Every 2 hours");
console.log("  - sync-market-prices: 8:00 AM IST daily");
console.log("  - cleanup-old-data: 2:00 AM IST daily");
console.log("  - update-weather: Every 3 hours");
