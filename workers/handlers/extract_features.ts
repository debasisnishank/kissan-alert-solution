/**
 * Farm Feature Extraction Handler
 * Extracts NDVI/EVI and weather data for farms using real APIs
 */

import { query, queryOne } from "$db/client.ts";
import { upsertObservation } from "$lib/observations.ts";
import {
  extractCompleteFarmData,
  getCurrentFarmHealth,
} from "$lib/satellite/ndvi_extractor.ts";
import { checkWeatherAlerts } from "$lib/satellite/weather.ts";

interface ExtractFarmFeaturesPayload {
  farmId: string;
  startDate?: string;
  endDate?: string;
  sources?: string[];
}

interface FarmRow {
  id: string;
  tenant_id: string;
  polygon_geojson: string;
}

interface CropRow {
  crop_type: string;
  sowing_date: Date;
}

function getPolygonCentroid(
  polygonGeoJSON: string,
): { lat: number; lon: number } {
  const geojson = JSON.parse(polygonGeoJSON);
  const coords = geojson.coordinates[0];
  let lat = 0;
  let lon = 0;
  for (const [x, y] of coords) {
    lon += x;
    lat += y;
  }
  return {
    lat: lat / coords.length,
    lon: lon / coords.length,
  };
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

export async function handleExtractFarmFeatures(
  payload: ExtractFarmFeaturesPayload,
): Promise<{
  observationsCreated: number;
  dateRange: { start: string; end: string };
  weatherAlerts?: number;
}> {
  console.log(`[JOB] Extracting features for farm: ${payload.farmId}`);

  // Get farm details
  const farm = await queryOne<FarmRow>(
    `SELECT id, tenant_id, ST_AsGeoJSON(polygon) as polygon_geojson
     FROM farms WHERE id = $1`,
    [payload.farmId],
  );

  if (!farm) {
    throw new Error(`Farm not found: ${payload.farmId}`);
  }

  // Get active crop declaration
  const crop = await queryOne<CropRow>(
    `SELECT crop_type, sowing_date FROM crop_declarations
     WHERE farm_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [payload.farmId],
  );

  const cropType = crop?.crop_type || "soybean";
  const sowingDate = crop?.sowing_date
    ? new Date(crop.sowing_date)
    : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Parse polygon
  const polygon = JSON.parse(farm.polygon_geojson);

  // Default date range: last 30 days to today
  const now = new Date();
  const startDate = payload.startDate ||
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
  const endDate = payload.endDate || now.toISOString().split("T")[0];

  // Extract vegetation indices and weather data
  console.log(
    `[JOB] Extracting data for ${cropType} (sown: ${
      sowingDate.toISOString().split("T")[0]
    })`,
  );

  const observations = await extractCompleteFarmData(
    polygon,
    startDate,
    endDate,
    { cropType, sowingDate },
  );

  let observationsCreated = 0;

  for (const obs of observations) {
    const daysAfterSowing = Math.floor(
      (obs.date.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const stageEstimate = estimateCropStage(Math.max(0, daysAfterSowing));

    try {
      await upsertObservation({
        farmId: payload.farmId,
        observationDate: obs.date,
        source: obs.source,
        ndvi: obs.ndvi,
        evi: obs.evi,
        rainfall24h: obs.rainfall24h,
        healthScore: obs.healthScore,
        stageEstimate,
        cloudCoverPct: obs.cloudCoverPct,
        metadata: {
          daysAfterSowing,
          cropType,
          soilMoisture: obs.soilMoisture,
        },
      });
      observationsCreated++;
    } catch (error) {
      console.error(`Failed to upsert observation:`, error);
    }
  }

  // Check for weather alerts
  const centroid = getPolygonCentroid(farm.polygon_geojson);
  let weatherAlertCount = 0;

  try {
    const alerts = await checkWeatherAlerts(centroid.lat, centroid.lon);
    weatherAlertCount = alerts.length;

    // Create alerts for severe conditions
    for (const alert of alerts) {
      if (alert.severity === "high" || alert.severity === "critical") {
        await createWeatherAlert(payload.farmId, farm.tenant_id, alert);
      }
    }
  } catch (error) {
    console.warn("[JOB] Weather alert check failed:", error);
  }

  console.log(
    `[JOB] Feature extraction complete: ${observationsCreated} observations, ${weatherAlertCount} weather alerts`,
  );

  return {
    observationsCreated,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    weatherAlerts: weatherAlertCount,
  };
}

async function createWeatherAlert(
  farmId: string,
  tenantId: string,
  alert: {
    type: string;
    severity: string;
    message: string;
  },
): Promise<boolean> {
  const { execute, queryOne } = await import("$db/client.ts");

  const alertTypeMap: Record<string, string> = {
    heavy_rain: "weather",
    drought: "weather",
    heat_wave: "weather",
    frost: "weather",
  };

  const alertType = alertTypeMap[alert.type] || "weather";
  const title = `Weather Alert: ${alert.type.replace("_", " ")}`;

  try {
    // Check for existing similar alert in last 24 hours
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM alerts 
       WHERE farm_id = $1 
         AND type = $2 
         AND title = $3
         AND status = 'active'
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [farmId, alertType, title],
    );

    if (existing) {
      console.log(
        `[ALERT] Skipping duplicate alert: ${title} for farm ${farmId}`,
      );
      return false;
    }

    await execute(
      `INSERT INTO alerts (tenant_id, farm_id, type, severity, title, description, trigger_data, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')`,
      [
        tenantId,
        farmId,
        alertType,
        alert.severity,
        title,
        alert.message || "Weather conditions require attention",
        JSON.stringify({ weatherType: alert.type }),
      ],
    );
    console.log(`[ALERT] Created: ${title} for farm ${farmId}`);
    return true;
  } catch (error) {
    console.error("Failed to create weather alert:", error);
    return false;
  }
}

/**
 * Extract features for all active farms
 */
export async function extractAllFarmFeatures(): Promise<{
  farmsProcessed: number;
  totalObservations: number;
}> {
  const farms = await query<{ id: string }>(
    `SELECT id FROM farms WHERE is_active = true`,
    [],
  );

  const today = new Date();
  const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const endDate = today.toISOString().split("T")[0];

  let totalObservations = 0;

  for (const farm of farms) {
    try {
      const result = await handleExtractFarmFeatures({
        farmId: farm.id,
        startDate,
        endDate,
      });
      totalObservations += result.observationsCreated;
    } catch (error) {
      console.error(`Failed to extract features for farm ${farm.id}:`, error);
    }
  }

  return {
    farmsProcessed: farms.length,
    totalObservations,
  };
}

/**
 * Get real-time farm health check
 */
export async function getFarmHealthCheck(farmId: string): Promise<{
  ndvi: number;
  evi: number;
  healthScore: number;
  rainfall24h: number;
  stressIndicators: string[];
  cropStage: string;
}> {
  const farm = await queryOne<FarmRow>(
    `SELECT id, tenant_id, ST_AsGeoJSON(polygon) as polygon_geojson
     FROM farms WHERE id = $1`,
    [farmId],
  );

  if (!farm) {
    throw new Error(`Farm not found: ${farmId}`);
  }

  const crop = await queryOne<CropRow>(
    `SELECT crop_type, sowing_date FROM crop_declarations
     WHERE farm_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [farmId],
  );

  const cropType = crop?.crop_type || "soybean";
  const sowingDate = crop?.sowing_date ? new Date(crop.sowing_date) : undefined;

  const polygon = JSON.parse(farm.polygon_geojson);
  const health = await getCurrentFarmHealth(polygon, cropType, sowingDate);

  const daysAfterSowing = sowingDate
    ? Math.floor(
      (Date.now() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    : 60;

  return {
    ...health,
    cropStage: estimateCropStage(daysAfterSowing),
  };
}
