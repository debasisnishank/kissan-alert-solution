import { Handlers } from "$fresh/server.ts";
import { queryOne } from "$db/client.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";
import { getCurrentFarmHealth } from "$lib/satellite/ndvi_extractor.ts";
import { checkWeatherAlerts, getDailyWeather } from "$lib/satellite/weather.ts";

interface FarmRow {
  id: string;
  tenant_id: string;
  polygon_geojson: string;
  name: string;
}

interface CropRow {
  crop_type: string;
  sowing_date: Date;
}

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_READ);
    if (authError) return authError;

    const farmId = ctx.params.id;
    const { session } = ctx.state;

    // Get farm with polygon
    const farm = await queryOne<FarmRow>(
      `SELECT id, tenant_id, name, ST_AsGeoJSON(polygon) as polygon_geojson
       FROM farms WHERE id = $1 AND tenant_id = $2`,
      [farmId, session!.tenantId],
    );

    if (!farm) {
      return new Response(JSON.stringify({ error: "Farm not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get active crop
    const crop = await queryOne<CropRow>(
      `SELECT crop_type, sowing_date FROM crop_declarations
       WHERE farm_id = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [farmId],
    );

    const cropType = crop?.crop_type || "soybean";
    const sowingDate = crop?.sowing_date
      ? new Date(crop.sowing_date)
      : undefined;

    const polygon = JSON.parse(farm.polygon_geojson);

    // Calculate centroid for weather
    const coords = polygon.coordinates[0];
    const centroid = {
      lat: coords.reduce((s: number, c: number[]) => s + c[1], 0) /
        coords.length,
      lon: coords.reduce((s: number, c: number[]) => s + c[0], 0) /
        coords.length,
    };

    try {
      // Get current health
      const health = await getCurrentFarmHealth(polygon, cropType, sowingDate);

      // Get weather forecast
      const today = new Date();
      const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      let weather = [];
      let alerts = [];

      try {
        weather = await getDailyWeather({
          lat: centroid.lat,
          lon: centroid.lon,
          startDate: today.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        });
        alerts = await checkWeatherAlerts(centroid.lat, centroid.lon);
      } catch (e) {
        console.warn("Weather fetch failed:", e);
      }

      return new Response(
        JSON.stringify({
          data: {
            farmId,
            farmName: farm.name,
            cropType,
            sowingDate: sowingDate?.toISOString().split("T")[0],
            health: {
              ndvi: health.ndvi,
              evi: health.evi,
              healthScore: health.healthScore,
              rainfall24h: health.rainfall24h,
              stressIndicators: health.stressIndicators,
              cropStage: health.cropStage,
            },
            weather: weather.map((w) => ({
              date: w.date.toISOString().split("T")[0],
              temperatureMax: w.temperatureMax,
              temperatureMin: w.temperatureMin,
              precipitation: w.precipitation,
            })),
            alerts: alerts.map((a) => ({
              type: a.type,
              severity: a.severity,
              message: a.message,
            })),
            updatedAt: new Date().toISOString(),
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Health check failed:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch farm health" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
