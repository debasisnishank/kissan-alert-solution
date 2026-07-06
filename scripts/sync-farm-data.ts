#!/usr/bin/env -S deno run -A
/**
 * Sync real satellite and weather data for all farms
 * Run: deno task sync:farms
 */
import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

// Dynamic imports so .env is loaded before utils/env.ts reads DATABASE_URL
// (static imports would hoist above the load() call)
const { closePool, execute, query } = await import("../db/client.ts");
const { getCurrentFarmHealth } = await import(
  "../lib/satellite/ndvi_extractor.ts"
);
const { checkWeatherAlerts, getDailyWeather } = await import(
  "../lib/satellite/weather.ts"
);

interface FarmRow {
  id: string;
  name: string;
  tenant_id: string;
  polygon_geojson: string;
  crop_type: string | null;
  sowing_date: Date | null;
}

async function syncFarmData() {
  console.log("Starting farm data sync...\n");

  // Get all active farms with their crops
  const farms = await query<FarmRow>(
    `SELECT 
      f.id, f.name, f.tenant_id,
      ST_AsGeoJSON(f.polygon) as polygon_geojson,
      c.crop_type, c.sowing_date
     FROM farms f
     LEFT JOIN crop_declarations c ON c.farm_id = f.id AND c.is_active = true`,
  );

  console.log(`Found ${farms.length} active farms\n`);

  for (const farm of farms) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Processing: ${farm.name} (${farm.id})`);
    console.log(`Crop: ${farm.crop_type || "unknown"}`);

    try {
      const polygon = JSON.parse(farm.polygon_geojson);
      const cropType = farm.crop_type || "soybean";
      const sowingDate = farm.sowing_date
        ? new Date(farm.sowing_date)
        : undefined;

      // Extract farm health data
      console.log("  Fetching satellite & weather data...");
      const health = await getCurrentFarmHealth(polygon, cropType, sowingDate);

      // Calculate centroid for weather
      const coords = polygon.coordinates[0];
      const centroid = {
        lat: coords.reduce((s: number, c: number[]) => s + c[1], 0) /
          coords.length,
        lon: coords.reduce((s: number, c: number[]) => s + c[0], 0) /
          coords.length,
      };

      // Get weather forecast for rainfall totals
      const today = new Date();
      const past7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      let rainfall72h = 0;
      let rainfall7d = 0;

      try {
        const weather = await getDailyWeather({
          lat: centroid.lat,
          lon: centroid.lon,
          startDate: past7d.toISOString().split("T")[0],
          endDate: today.toISOString().split("T")[0],
        });
        rainfall7d = weather.reduce((sum, w) => sum + w.precipitation, 0);
        rainfall72h = weather.slice(-3).reduce(
          (sum, w) => sum + w.precipitation,
          0,
        );
      } catch (e) {
        console.log("  Weather fetch failed:", e);
      }

      // Estimate crop stage from sowing date
      let cropStage = "unknown";
      if (sowingDate) {
        const daysSinceSowing = Math.floor(
          (today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceSowing < 15) cropStage = "emergence";
        else if (daysSinceSowing < 45) cropStage = "vegetative";
        else if (daysSinceSowing < 75) cropStage = "flowering";
        else if (daysSinceSowing < 100) cropStage = "grain_filling";
        else cropStage = "maturity";
      }

      console.log(`  NDVI: ${health.ndvi?.toFixed(3) || "N/A"}`);
      console.log(`  EVI: ${health.evi?.toFixed(3) || "N/A"}`);
      console.log(`  Health Score: ${health.healthScore}/100`);
      console.log(`  Crop Stage: ${cropStage}`);
      console.log(
        `  Rainfall 24h: ${health.rainfall24h}mm, 7d: ${rainfall7d}mm`,
      );

      // Store observation
      const todayStr = today.toISOString().split("T")[0];
      await execute(
        `INSERT INTO farm_observations (
          farm_id, observation_date, source,
          ndvi, evi, health_score, stage_estimate,
          rainfall_24h, rainfall_72h, rainfall_7d,
          anomaly_score, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (farm_id, observation_date, source) 
        DO UPDATE SET
          ndvi = EXCLUDED.ndvi,
          evi = EXCLUDED.evi,
          health_score = EXCLUDED.health_score,
          stage_estimate = EXCLUDED.stage_estimate,
          rainfall_24h = EXCLUDED.rainfall_24h,
          rainfall_72h = EXCLUDED.rainfall_72h,
          rainfall_7d = EXCLUDED.rainfall_7d,
          anomaly_score = EXCLUDED.anomaly_score,
          metadata = EXCLUDED.metadata`,
        [
          farm.id,
          todayStr,
          "element84+openmeteo",
          health.ndvi,
          health.evi,
          health.healthScore,
          cropStage,
          health.rainfall24h,
          rainfall72h,
          rainfall7d,
          health.stressIndicators.length > 0 ? 0.3 : 0,
          JSON.stringify({
            stressIndicators: health.stressIndicators,
            syncedAt: new Date().toISOString(),
          }),
        ],
      );
      console.log("  ✓ Observation saved");

      // Check for weather alerts and create them
      const alerts = await checkWeatherAlerts(centroid.lat, centroid.lon);
      console.log(`  Weather alerts: ${alerts.length}`);

      for (const alert of alerts) {
        // Check if similar alert exists
        const existing = await query(
          `SELECT id FROM alerts 
           WHERE farm_id = $1 AND type = $2 AND status = 'active'
           AND created_at > NOW() - INTERVAL '24 hours'`,
          [farm.id, alert.type],
        );

        if (existing.length === 0) {
          await execute(
            `INSERT INTO alerts (
              tenant_id, farm_id, type, severity, title, description,
              confidence, trigger_data, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
            [
              farm.tenant_id,
              farm.id,
              alert.type,
              alert.severity,
              alert.message,
              alert.message,
              0.85,
              JSON.stringify({ weather: alert }),
            ],
          );
          console.log(`  ✓ Created alert: ${alert.type} (${alert.severity})`);
        }
      }

      // Generate crop-specific alerts based on stress indicators
      for (const stress of health.stressIndicators) {
        const existing = await query(
          `SELECT id FROM alerts 
           WHERE farm_id = $1 AND type = $2 AND status = 'active'
           AND created_at > NOW() - INTERVAL '24 hours'`,
          [farm.id, stress],
        );

        if (existing.length === 0) {
          const alertConfig: Record<
            string,
            { title: string; description: string; severity: string }
          > = {
            water_stress: {
              title: "Water Stress Detected",
              description:
                "Low vegetation indices suggest water stress. Consider irrigation if soil is dry.",
              severity: "medium",
            },
            low_vigor: {
              title: "Low Crop Vigor",
              description:
                "NDVI values are below expected for this crop stage. Monitor for nutrient deficiency or pest damage.",
              severity: "medium",
            },
            pest_risk: {
              title: "Pest Risk Alert",
              description:
                "Weather conditions favorable for pest development. Scout fields and consider preventive measures.",
              severity: "high",
            },
          };

          const config = alertConfig[stress];
          if (config) {
            await execute(
              `INSERT INTO alerts (
                tenant_id, farm_id, type, severity, title, description,
                confidence, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
              [
                farm.tenant_id,
                farm.id,
                stress,
                config.severity,
                config.title,
                config.description,
                0.75,
              ],
            );
            console.log(`  ✓ Created alert: ${stress} (${config.severity})`);
          }
        }
      }
    } catch (error) {
      console.error(`  ✗ Error processing ${farm.name}:`, error);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("Farm data sync complete!");
}

// Run
await syncFarmData();
await closePool();
