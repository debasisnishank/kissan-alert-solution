import { Handlers } from "$fresh/server.ts";
import { getFarmById } from "$lib/farm.ts";
import { getFarmSoilData } from "$lib/soil.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { scoreCrops } from "$lib/crop-scoring.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

function farmCentroid(
  polygon?: { coordinates?: number[][][] },
): { lat: number; lon: number } {
  const coords = polygon?.coordinates?.[0];
  if (!coords || coords.length === 0) {
    return { lat: 20.5937, lon: 78.9629 }; // India centroid fallback
  }
  return {
    lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
    lon: coords.reduce((s, c) => s + c[0], 0) / coords.length,
  };
}

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { farmId } = ctx.params;
    const { session } = ctx.state;

    const farm = await getFarmById(farmId, session.tenantId);
    if (!farm) {
      return Response.json({ error: "Farm not found" }, { status: 404 });
    }

    const { lat, lon } = farmCentroid(farm.polygon);

    const stats = await getFarmHealthStats(farmId);

    const [soil, forecast] = await Promise.all([
      getFarmSoilData({
        farmId: farm.id,
        lat,
        lon,
        soilType: farm.soilType,
        healthScore: Number(stats.healthScore) || 60,
        state: farm.state,
        district: farm.district,
      }),
      getDailyWeather({
        lat,
        lon,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
          .toISOString().split("T")[0],
      }).catch(() => []),
    ]);

    const result = scoreCrops({
      soil,
      forecast,
      waterSource: farm.waterSource,
      latestNdvi: stats.latestNdvi,
      ndviTrend: stats.ndviTrend,
      rainfall7d: stats.totalRainfall7d,
    });

    return Response.json({
      farmId: farm.id,
      farmName: farm.name,
      season: result.season,
      // Top 8 ranked crops with full factor breakdowns; the rest as a summary
      recommendations: result.recommendations.slice(0, 8),
      others: result.recommendations.slice(8).map((r) => ({
        cropId: r.cropId,
        name: r.name,
        score: r.score,
        verdict: r.verdict,
      })),
      dataCited: result.dataCited,
      generatedAt: new Date().toISOString(),
    });
  },
};
