import { Handlers } from "$fresh/server.ts";
import { queryOne } from "$db/client.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";
import { type FarmAnalysisInput, getGeminiClient } from "$ai/gemini.ts";
import { getCurrentFarmHealth } from "$lib/satellite/ndvi_extractor.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { getCropStage } from "$lib/config.ts";

interface FarmRow {
  id: string;
  name: string;
  tenant_id: string;
  polygon_geojson: string;
  district: string | null;
  state: string | null;
  soil_type: string | null;
  water_source: string | null;
}

interface CropRow {
  crop_type: string;
  sowing_date: Date;
  irrigation_type: string | null;
}

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_READ);
    if (authError) return authError;

    const farmId = ctx.params.id;
    const { session } = ctx.state;

    // Get farm details
    const farm = await queryOne<FarmRow>(
      `SELECT id, name, tenant_id, ST_AsGeoJSON(polygon) as polygon_geojson,
              district, state, soil_type, water_source
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
      `SELECT crop_type, sowing_date, irrigation_type FROM crop_declarations
       WHERE farm_id = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [farmId],
    );

    const gemini = getGeminiClient();

    if (!gemini.isAvailable()) {
      return new Response(
        JSON.stringify({
          error: "AI analysis not available",
          message: "Vertex AI access not configured for this project.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const polygon = JSON.parse(farm.polygon_geojson);
      const cropType = crop?.crop_type || "unknown";
      const sowingDate = crop?.sowing_date
        ? new Date(crop.sowing_date)
        : undefined;

      // Calculate centroid
      const coords = polygon.coordinates[0];
      const centroid = {
        lat: coords.reduce((s: number, c: number[]) => s + c[1], 0) /
          coords.length,
        lon: coords.reduce((s: number, c: number[]) => s + c[0], 0) /
          coords.length,
      };

      // Get health data
      const health = await getCurrentFarmHealth(polygon, cropType, sowingDate);

      // Get weather data
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      let weather = {
        temperature: 25,
        humidity: 60,
        rainfall7d: 0,
        forecast: "No data",
      };

      try {
        const weatherData = await getDailyWeather({
          lat: centroid.lat,
          lon: centroid.lon,
          startDate: weekAgo.toISOString().split("T")[0],
          endDate: today.toISOString().split("T")[0],
        });

        if (weatherData.length > 0) {
          const latest = weatherData[weatherData.length - 1];
          weather = {
            temperature: latest.temperatureMax,
            humidity: 60, // Estimated
            rainfall7d: weatherData.reduce(
              (sum, w) => sum + w.precipitation,
              0,
            ),
            forecast: weatherData.slice(-3).some((w) => w.precipitation > 5)
              ? "Rain expected"
              : "Dry conditions",
          };
        }
      } catch {
        // Use defaults
      }

      // Calculate crop stage
      let cropStage = "Unknown";
      if (sowingDate) {
        const daysAfterSowing = Math.floor(
          (today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const stage = getCropStage(cropType, daysAfterSowing);
        cropStage = stage?.name || "Unknown";
      }

      // Prepare input for Gemini
      const analysisInput: FarmAnalysisInput = {
        farmName: farm.name,
        cropType,
        cropStage,
        sowingDate: sowingDate?.toISOString().split("T")[0] || "Unknown",
        location: {
          lat: centroid.lat,
          lon: centroid.lon,
          district: farm.district || "Unknown",
          state: farm.state || "Unknown",
        },
        weather,
        health: {
          ndvi: health.ndvi,
          evi: health.evi,
          healthScore: health.healthScore,
          stressIndicators: health.stressIndicators,
        },
        soilType: farm.soil_type || undefined,
        irrigationType: crop?.irrigation_type || farm.water_source || undefined,
      };

      // Get AI analysis
      const analysis = await gemini.analyzeFarmHealth(analysisInput);

      return new Response(
        JSON.stringify({
          data: {
            farmId,
            farmName: farm.name,
            cropType,
            cropStage,
            analysis,
            input: analysisInput,
            generatedAt: new Date().toISOString(),
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("AI analysis failed:", error);
      return new Response(
        JSON.stringify({
          error: "Analysis failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
