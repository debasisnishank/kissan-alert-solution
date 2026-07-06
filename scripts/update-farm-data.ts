/**
 * Script to manually update farm observations and generate alerts
 * Run with: deno run -A scripts/update-farm-data.ts [farmId]
 */

import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

const { query, queryOne } = await import("../db/client.ts");
const { upsertObservation, getFarmHealthStats } = await import(
  "../lib/observations.ts"
);
const { checkWeatherAlerts, getDailyWeather } = await import(
  "../lib/satellite/weather.ts"
);
const { createAlert } = await import("../lib/alerts.ts");

interface FarmRow {
  id: string;
  name: string;
  tenant_id: string;
  polygon_geojson: string;
  district: string | null;
}

interface CropRow {
  crop_type: string;
  sowing_date: Date;
}

function getPolygonCentroid(
  polygonGeoJSON: string,
): { lat: number; lon: number } {
  try {
    const geojson = JSON.parse(polygonGeoJSON);
    const coords = geojson.coordinates[0];
    let lat = 0, lon = 0;
    for (const [x, y] of coords) {
      lon += x;
      lat += y;
    }
    return { lat: lat / coords.length, lon: lon / coords.length };
  } catch {
    // Default to Maharashtra, India
    return { lat: 19.7515, lon: 75.7139 };
  }
}

function estimateCropStage(daysAfterSowing: number): string {
  if (daysAfterSowing < 15) return "Germination";
  if (daysAfterSowing < 30) return "Seedling";
  if (daysAfterSowing < 50) return "Vegetative";
  if (daysAfterSowing < 70) return "Flowering";
  if (daysAfterSowing < 90) return "Pod Formation";
  if (daysAfterSowing < 110) return "Grain Filling";
  return "Maturity";
}

function calculateNDVI(
  _cropType: string,
  stage: string,
  rainfall7d: number,
): number {
  // Base NDVI by crop and stage
  const ndviByStage: Record<string, number> = {
    "Germination": 0.25,
    "Seedling": 0.35,
    "Vegetative": 0.55,
    "Flowering": 0.70,
    "Pod Formation": 0.65,
    "Grain Filling": 0.55,
    "Maturity": 0.40,
  };

  let baseNdvi = ndviByStage[stage] || 0.5;

  // Adjust based on rainfall
  if (rainfall7d < 5) baseNdvi *= 0.85; // Drought stress
  else if (rainfall7d > 100) baseNdvi *= 0.90; // Waterlogging

  // Add some randomness
  const variation = (Math.random() - 0.5) * 0.1;
  return Math.max(0.1, Math.min(0.95, baseNdvi + variation));
}

function calculateHealthScore(
  ndvi: number,
  rainfall7d: number,
  stage: string,
): number {
  let score = ndvi * 100;

  // Weather adjustments
  if (rainfall7d < 5) score -= 10;
  else if (rainfall7d > 100) score -= 15;

  // Growth stage bonus
  if (["Vegetative", "Flowering"].includes(stage)) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function updateFarm(farmId: string): Promise<void> {
  console.log(`\n[UPDATE] Processing farm: ${farmId}`);

  // Get farm details
  const farm = await queryOne<FarmRow>(
    `SELECT id, name, tenant_id, ST_AsGeoJSON(polygon) as polygon_geojson, district
     FROM farms WHERE id = $1`,
    [farmId],
  );

  if (!farm) {
    console.error(`[ERROR] Farm not found: ${farmId}`);
    return;
  }

  console.log(`[INFO] Farm: ${farm.name} (${farm.district || "Unknown"})`);

  // Get active crop
  const crop = await queryOne<CropRow>(
    `SELECT crop_type, sowing_date FROM crop_declarations 
     WHERE farm_id = $1 AND is_active = true
     ORDER BY sowing_date DESC LIMIT 1`,
    [farmId],
  );

  const cropType = crop?.crop_type || "wheat";
  const sowingDate = crop?.sowing_date ||
    new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const daysAfterSowing = Math.floor(
    (Date.now() - new Date(sowingDate).getTime()) / (1000 * 60 * 60 * 24),
  );
  const stage = estimateCropStage(daysAfterSowing);

  console.log(
    `[INFO] Crop: ${cropType}, Stage: ${stage}, Day: ${daysAfterSowing}`,
  );

  // Get location
  const centroid = getPolygonCentroid(
    farm.polygon_geojson || '{"coordinates":[[[75.7139,19.7515]]]}',
  );
  console.log(
    `[INFO] Location: ${centroid.lat.toFixed(4)}, ${centroid.lon.toFixed(4)}`,
  );

  // Get weather data
  let rainfall7d = 0;
  let temperature = 25;
  try {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weather = await getDailyWeather({
      lat: centroid.lat,
      lon: centroid.lon,
      startDate: weekAgo.toISOString().split("T")[0],
      endDate: today.toISOString().split("T")[0],
    });

    rainfall7d = weather.reduce((sum, d) => sum + (d.precipitation || 0), 0);
    temperature = weather[weather.length - 1]?.temperatureMax || 25;
    console.log(
      `[INFO] Weather: ${rainfall7d.toFixed(1)}mm rain (7d), ${temperature}°C`,
    );
  } catch (e) {
    console.log(`[WARN] Weather fetch failed: ${e.message}`);
  }

  // Calculate vegetation indices
  const ndvi = calculateNDVI(cropType, stage, rainfall7d);
  const evi = ndvi * 0.85; // EVI is typically lower than NDVI
  const healthScore = calculateHealthScore(ndvi, rainfall7d, stage);

  console.log(
    `[INFO] NDVI: ${ndvi.toFixed(3)}, EVI: ${
      evi.toFixed(3)
    }, Health: ${healthScore}`,
  );

  // Save observation
  try {
    await upsertObservation({
      farmId,
      observationDate: new Date(),
      source: "computed",
      ndvi,
      evi,
      rainfall24h: rainfall7d / 7,
      healthScore,
      stageEstimate: stage,
      cloudCoverPct: Math.random() * 30,
      metadata: {
        cropType,
        daysAfterSowing,
        temperature,
        rainfall7d,
      },
    });
    console.log(`[SUCCESS] Observation saved`);
  } catch (e) {
    console.error(`[ERROR] Failed to save observation: ${e.message}`);
  }

  // Check for weather alerts
  try {
    const alerts = await checkWeatherAlerts(centroid.lat, centroid.lon);
    for (const alert of alerts) {
      if (alert.severity === "high" || alert.severity === "critical") {
        // Check for duplicate
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM alerts 
           WHERE farm_id = $1 AND type = 'weather' AND title LIKE $2
           AND status = 'active' AND created_at > NOW() - INTERVAL '24 hours'`,
          [farmId, `%${alert.type}%`],
        );

        if (!existing) {
          await createAlert({
            tenantId: farm.tenant_id,
            farmId,
            type: "weather",
            severity: alert.severity as "low" | "medium" | "high" | "critical",
            title: `Weather Alert: ${alert.type.replace("_", " ")}`,
            description: alert.message,
            triggerData: { weatherType: alert.type },
          });
          console.log(`[ALERT] Created: ${alert.type}`);
        } else {
          console.log(`[ALERT] Skipped duplicate: ${alert.type}`);
        }
      }
    }
  } catch (e) {
    console.log(`[WARN] Alert check failed: ${e.message}`);
  }

  // Get updated stats
  const stats = await getFarmHealthStats(farmId);
  const latestNdvi = stats.latestNdvi != null
    ? Number(stats.latestNdvi).toFixed(3)
    : "N/A";
  const healthScr = stats.healthScore != null
    ? Number(stats.healthScore)
    : "N/A";
  console.log(`[RESULT] Latest NDVI: ${latestNdvi}, Health: ${healthScr}`);
}

async function main() {
  const farmId = Deno.args[0];

  if (farmId) {
    // Update specific farm
    await updateFarm(farmId);
  } else {
    // Update all active farms
    const farms = await query<{ id: string; name: string }>(
      `SELECT id, name FROM farms WHERE is_active = true`,
      [],
    );

    console.log(`[INFO] Found ${farms.length} active farms`);

    for (const farm of farms) {
      await updateFarm(farm.id);
    }
  }

  console.log("\n[DONE] Update complete!");
  Deno.exit(0);
}

main().catch((e) => {
  console.error("[FATAL]", e);
  Deno.exit(1);
});
