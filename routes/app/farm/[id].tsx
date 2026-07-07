import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import {
  getFarmHealthStats,
  getObservationsByFarm,
} from "$lib/observations.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { type FarmSoilData, getFarmSoilData, getSoilScore } from "$lib/soil.ts";
import { query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";
import NDVIChart from "$islands/NDVIChart.tsx";
import FarmMapPreview from "$islands/FarmMapPreview.tsx";
import CropRecommendations from "$islands/CropRecommendations.tsx";

interface ProductRecommendation {
  id: string;
  name: string;
  category: string;
  reason: string;
  price: number;
  isCrossSell: boolean;
}

interface FarmDetailData {
  farm: {
    id: string;
    name: string;
    areaHectares: number;
    district: string;
    state: string;
    village: string;
    soilType: string;
    waterSource: string;
    isVerified: boolean;
    lat: number;
    lon: number;
    polygon: number[][] | null;
  };
  crop: {
    cropType: string;
    variety: string;
    sowingDate: string;
    irrigationType: string;
    season: string;
    daysAfterSowing: number;
    stage: string;
    expectedYield: number;
    expectedHarvest: string;
  } | null;
  stats: {
    healthScore: number;
    latestNdvi: number;
    ndviTrend: string;
    totalRainfall7d: number;
    daysAfterSowing: number;
  };
  agriScore: {
    overall: number;
    health: number;
    soil: number;
    water: number;
    management: number;
  };
  weather: {
    temp: number;
    humidity: number;
    rainfall7d: number;
    forecast: Array<{ day: string; temp: number; rain: number }>;
  } | null;
  soil: FarmSoilData;
  observations: Array<{ date: string; ndvi: number; rainfall: number }>;
  alertCount: number;
  recommendations: ProductRecommendation[];
}

export const handler: Handlers<FarmDetailData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params;
    const { session, user } = ctx.state;

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    const [crop, stats, observations, alerts] = await Promise.all([
      getActiveCropByFarm(farm.id),
      getFarmHealthStats(farm.id),
      getObservationsByFarm(farm.id, { limit: 60 }),
      getAlertsWithAdvisory(farm.id, session.tenantId, user.language, {
        status: "active",
        limit: 100,
      }),
    ]);

    // Get centroid for weather
    let lat = 20.5937, lon = 78.9629;
    if (farm.polygon?.coordinates?.[0]) {
      const coords = farm.polygon.coordinates[0];
      lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) /
        coords.length;
      lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) /
        coords.length;
    }

    // Get weather
    let weather: FarmDetailData["weather"] = null;
    try {
      const today = new Date();
      const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weatherData = await getDailyWeather({
        lat,
        lon,
        startDate: today.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      });
      if (weatherData.length > 0) {
        weather = {
          temp: Math.round(weatherData[0].temperatureMax),
          humidity: 65,
          rainfall7d: Math.round(
            weatherData.reduce((s, w) => s + w.precipitation, 0),
          ),
          forecast: weatherData.slice(0, 5).map((w, i) => ({
            day: i === 0
              ? "Today"
              : new Date(w.date).toLocaleDateString("en-IN", {
                weekday: "short",
              }),
            temp: Math.round(w.temperatureMax),
            rain: Math.round(w.precipitation),
          })),
        };
      }
    } catch { /* ignore */ }

    // Calculate crop info
    let daysAfterSowing = 0;
    let stage = "Not Planted";
    let expectedHarvest = "N/A";
    let expectedYield = 0;
    if (crop) {
      const sowingDate = new Date(crop.sowingDate);
      daysAfterSowing = Math.floor(
        (Date.now() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysAfterSowing < 15) stage = "Germination";
      else if (daysAfterSowing < 30) stage = "Seedling";
      else if (daysAfterSowing < 50) stage = "Vegetative";
      else if (daysAfterSowing < 70) stage = "Flowering";
      else if (daysAfterSowing < 90) stage = "Pod Formation";
      else stage = "Maturity";

      const harvestDate = new Date(
        sowingDate.getTime() + 120 * 24 * 60 * 60 * 1000,
      );
      expectedHarvest = harvestDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      expectedYield = Math.round(
        farm.areaHectares * 25 * (Number(stats.healthScore) / 100 || 0.7),
      );
    }

    // Calculate Agri Score components
    // Estimate health score from crop stage if not available from observations
    let healthScore = Number(stats.healthScore) || 0;
    if (healthScore === 0 && crop && daysAfterSowing > 0) {
      // Estimate based on typical NDVI for growth stage
      let estimatedNdvi = 0.4;
      if (daysAfterSowing < 15) estimatedNdvi = 0.2;
      else if (daysAfterSowing < 30) estimatedNdvi = 0.38;
      else if (daysAfterSowing < 50) estimatedNdvi = 0.58;
      else if (daysAfterSowing < 70) estimatedNdvi = 0.72;
      else if (daysAfterSowing < 90) estimatedNdvi = 0.65;
      else estimatedNdvi = 0.5;
      healthScore = Math.round(estimatedNdvi * 100);
    }
    if (healthScore === 0) healthScore = 50; // Default fallback
    const soilScore = getSoilScore({
      farmId: farm.id,
      soilType: farm.soilType,
      waterSource: farm.waterSource,
    });
    const waterScore = farm.waterSource === "borewell"
      ? 80
      : farm.waterSource === "canal"
      ? 90
      : 60;
    const managementScore = crop ? (farm.isVerified ? 85 : 70) : 50;
    const overallScore = Math.round(
      (healthScore * 0.4) + (soilScore * 0.2) + (waterScore * 0.2) +
        (managementScore * 0.2),
    );

    // Get product recommendations
    const recommendations: ProductRecommendation[] = [];
    try {
      const products = await query<{
        id: string;
        name: string;
        category: string;
        price: number;
        recommended_for: string[];
      }>(
        `SELECT id, name, category, price, recommended_for FROM agri_products 
         WHERE is_active = true AND ($1 = ANY(recommended_for) OR cardinality(recommended_for) = 0)
         ORDER BY RANDOM() LIMIT 6`,
        [crop?.cropType || "wheat"],
      );
      products.forEach((p, i) => {
        recommendations.push({
          id: p.id,
          name: p.name,
          category: p.category,
          reason: getRecommendationReason(p.category, stage, healthScore),
          price: Number(p.price) || 0,
          isCrossSell: i >= 3,
        });
      });
    } catch {
      // Mock recommendations
      recommendations.push(
        {
          id: "1",
          name: "DAP Fertilizer",
          category: "fertilizer",
          reason: "Essential for " + stage + " stage",
          price: 1350,
          isCrossSell: false,
        },
        {
          id: "2",
          name: "Urea",
          category: "fertilizer",
          reason: "Boost nitrogen for growth",
          price: 280,
          isCrossSell: false,
        },
        {
          id: "3",
          name: "Organic Compost",
          category: "fertilizer",
          reason: "Improve soil health",
          price: 450,
          isCrossSell: true,
        },
      );
    }

    // Get soil data from deterministic calculation + real-time APIs
    const soil = await getFarmSoilData({
      farmId: farm.id,
      lat,
      lon,
      soilType: farm.soilType,
      healthScore,
      state: farm.state,
      district: farm.district,
    });

    return ctx.render({
      farm: {
        id: farm.id,
        name: farm.name,
        areaHectares: farm.areaHectares,
        district: farm.district || "Unknown",
        state: farm.state || "Unknown",
        village: farm.village || "Unknown",
        soilType: farm.soilType || "Unknown",
        waterSource: farm.waterSource || "Unknown",
        isVerified: farm.isVerified,
        lat,
        lon,
        polygon:
          farm.polygon?.coordinates?.[0]?.map((c: number[]) => [c[1], c[0]]) ||
          null,
      },
      crop: crop
        ? {
          cropType: crop.cropType,
          variety: crop.variety || "Not specified",
          sowingDate: new Date(crop.sowingDate).toLocaleDateString("en-IN"),
          irrigationType: crop.irrigationType,
          season: crop.season,
          daysAfterSowing,
          stage,
          expectedYield,
          expectedHarvest,
        }
        : null,
      stats: {
        healthScore,
        latestNdvi: Number(stats.latestNdvi) || (healthScore / 100),
        ndviTrend: stats.ndviTrend ?? "stable",
        totalRainfall7d: Number(stats.totalRainfall7d) || 0,
        daysAfterSowing,
      },
      agriScore: {
        overall: overallScore,
        health: healthScore,
        soil: soilScore,
        water: waterScore,
        management: managementScore,
      },
      weather,
      soil,
      observations: observations.reverse().map((o) => ({
        date: new Date(o.observationDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        ndvi: Number(o.ndvi) || 0,
        rainfall: Number(o.rainfall24h) || 0,
      })),
      alertCount: alerts.length,
      recommendations,
    });
  },
};

function getRecommendationReason(
  category: string,
  stage: string,
  health: number,
): string {
  if (category === "fertilizer") {
    if (health < 60) return "Boost crop health";
    return `Recommended for ${stage} stage`;
  }
  if (category === "pesticide") return "Preventive pest control";
  if (category === "seed") return "High-yield variety";
  return "Enhance farm productivity";
}

export default function FarmDetailPage({ data }: PageProps<FarmDetailData>) {
  const {
    farm,
    crop,
    stats,
    agriScore,
    weather,
    soil,
    observations,
    alertCount,
    recommendations,
  } = data;

  const cropLabels: Record<string, string> = {
    rice: "Rice",
    wheat: "Wheat",
    maize: "Maize",
    cotton: "Cotton",
    soybean: "Soybean",
    sugarcane: "Sugarcane",
    groundnut: "Groundnut",
  };

  const _getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const _getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <AppShell
      title={farm.name}
      showBack
      farmContext={{
        farmName: farm.name,
        location: `${farm.village}, ${farm.district}, ${farm.state}`,
        activeCrop: crop?.cropType,
        cropStage: crop?.stage,
        healthScore: stats.healthScore,
        daysAfterSowing: crop?.daysAfterSowing,
      }}
      actions={
        <button
          type="button"
          id="export-pdf-btn"
          class="p-2 hover:bg-primary-700 rounded-lg"
          title="Export PDF"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>
      }
    >
      <div id="farm-report">
        {/* Agri Score Card */}
        <div class="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-4 text-white mb-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-primary-200 text-sm">Agri Score</p>
              <p class="text-4xl font-bold">{agriScore.overall}</p>
              <p class="text-primary-200 text-xs">Out of 100</p>
            </div>
            <div class="w-20 h-20 relative">
              <svg class="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeDasharray={`${agriScore.overall} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-lg font-bold">
                  {agriScore.overall >= 80
                    ? "A"
                    : agriScore.overall >= 60
                    ? "B"
                    : "C"}
                </span>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p class="text-primary-200">Health</p>
              <p class="font-bold">{agriScore.health}</p>
            </div>
            <div>
              <p class="text-primary-200">Soil</p>
              <p class="font-bold">{agriScore.soil}</p>
            </div>
            <div>
              <p class="text-primary-200">Water</p>
              <p class="font-bold">{agriScore.water}</p>
            </div>
            <div>
              <p class="text-primary-200">Mgmt</p>
              <p class="font-bold">{agriScore.management}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div class="grid grid-cols-4 gap-2 mb-4">
          <a
            href={`/app/farm/${farm.id}/alerts`}
            class="bg-white rounded-lg border p-3 text-center"
          >
            <div class="w-8 h-8 mx-auto mb-1 bg-red-100 rounded-full flex items-center justify-center">
              <span class="text-red-600 font-bold text-sm">{alertCount}</span>
            </div>
            <p class="text-xs text-gray-600">Alerts</p>
          </a>
          <a
            href={`/app/farm/${farm.id}/analyze`}
            class="bg-white rounded-lg border p-3 text-center"
          >
            <div class="w-8 h-8 mx-auto mb-1 bg-blue-100 rounded-full flex items-center justify-center">
              <svg
                class="w-4 h-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p class="text-xs text-gray-600">Analysis</p>
          </a>
          <a
            href={`/app/farm/${farm.id}/log`}
            class="bg-white rounded-lg border p-3 text-center"
          >
            <div class="w-8 h-8 mx-auto mb-1 bg-purple-100 rounded-full flex items-center justify-center">
              <svg
                class="w-4 h-4 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
            </div>
            <p class="text-xs text-gray-600">Activity</p>
          </a>
          <a
            href={`/api/farms/${farm.id}/export?format=csv`}
            class="bg-white rounded-lg border p-3 text-center"
          >
            <div class="w-8 h-8 mx-auto mb-1 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                class="w-4 h-4 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p class="text-xs text-gray-600">Export</p>
          </a>
        </div>

        {/* Crop Health Timeline - Enhanced */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900">Crop Health Timeline</h3>
            <div class="flex items-center gap-2">
              <span
                class={`px-2 py-1 rounded text-sm font-medium ${
                  stats.healthScore >= 70
                    ? "bg-green-100 text-green-700"
                    : stats.healthScore >= 50
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {stats.healthScore.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Health Stats Row */}
          <div class="grid grid-cols-4 gap-2 mb-4">
            <div class="text-center p-2 bg-green-50 rounded-lg">
              <p class="text-lg font-bold text-green-600">
                {stats.latestNdvi.toFixed(2)}
              </p>
              <p class="text-xs text-gray-500">NDVI</p>
            </div>
            <div class="text-center p-2 bg-blue-50 rounded-lg">
              <p class="text-lg font-bold text-blue-600">
                {stats.totalRainfall7d.toFixed(0)}mm
              </p>
              <p class="text-xs text-gray-500">7d Rain</p>
            </div>
            <div class="text-center p-2 bg-purple-50 rounded-lg">
              <p class="text-lg font-bold text-purple-600 capitalize">
                {stats.ndviTrend || "stable"}
              </p>
              <p class="text-xs text-gray-500">Trend</p>
            </div>
            <div class="text-center p-2 bg-orange-50 rounded-lg">
              <p class="text-lg font-bold text-orange-600">
                {crop?.daysAfterSowing || 0}
              </p>
              <p class="text-xs text-gray-500">Days</p>
            </div>
          </div>

          {/* NDVI Chart with Predictions */}
          <NDVIChart
            observations={observations}
            showPredictions
            cropType={crop?.cropType || "wheat"}
            daysAfterSowing={crop?.daysAfterSowing || 60}
          />

          {/* Health Interpretation */}
          <div class="mt-4 p-3 bg-gray-50 rounded-lg">
            <p class="text-sm text-gray-700">
              <span class="font-medium">Status:</span>
              {stats.healthScore >= 70
                ? "Crop is healthy with good vegetation cover. Continue current practices."
                : stats.healthScore >= 50
                ? "Crop health is moderate. Monitor closely and consider nutrient boost."
                : "Crop shows signs of stress. Check for water, pest, or nutrient issues."}
            </p>
            {stats.ndviTrend === "declining" && (
              <p class="text-sm text-red-600 mt-2">
                ⚠️ NDVI is declining. Check for pest, disease, or water stress.
              </p>
            )}
            {stats.ndviTrend === "improving" && (
              <p class="text-sm text-green-600 mt-2">
                ✓ NDVI is improving. Current management is effective.
              </p>
            )}
          </div>
        </div>

        {/* Weather Card */}
        {weather && (
          <div class="bg-white rounded-xl border p-4 mb-4">
            <h3 class="font-semibold text-gray-900 mb-3">Weather Conditions</h3>
            <div class="flex items-center gap-4 mb-3">
              <div class="text-center">
                <p class="text-3xl font-bold text-gray-900">{weather.temp}°C</p>
                <p class="text-xs text-gray-500">Current</p>
              </div>
              <div class="text-center">
                <p class="text-xl font-bold text-blue-600">
                  {weather.rainfall7d}mm
                </p>
                <p class="text-xs text-gray-500">7-day rain</p>
              </div>
              <div class="text-center">
                <p class="text-xl font-bold text-gray-600">
                  {weather.humidity}%
                </p>
                <p class="text-xs text-gray-500">Humidity</p>
              </div>
            </div>
            <div class="flex gap-2 overflow-x-auto">
              {weather.forecast.map((f, i) => (
                <div
                  key={i}
                  class="flex-shrink-0 text-center px-2 py-1 bg-gray-50 rounded"
                >
                  <p class="text-xs text-gray-500">{f.day}</p>
                  <p class="font-medium text-sm">{f.temp}°</p>
                  {f.rain > 0 && (
                    <p class="text-xs text-blue-500">{f.rain}mm</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Soil Analysis - Enhanced with UPAg/Bhuvan/SoilGrids */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900">Soil Analysis</h3>
            {soil.sources && soil.sources.length > 0 && (
              <span class="text-xs text-gray-400">
                {soil.sources.join(" • ")}
              </span>
            )}
          </div>

          {/* Primary Metrics */}
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div class="text-center p-2 bg-blue-50 rounded-lg">
              <p class="text-xl font-bold text-blue-600">{soil.moisture}%</p>
              <p class="text-xs text-gray-600">Moisture</p>
            </div>
            <div class="text-center p-2 bg-orange-50 rounded-lg">
              <p class="text-xl font-bold text-orange-600">
                {soil.temperature}°C
              </p>
              <p class="text-xs text-gray-600">Temp</p>
            </div>
            <div class="text-center p-2 bg-green-50 rounded-lg">
              <p class="text-xl font-bold text-green-600">
                {soil.ph.toFixed(1)}
              </p>
              <p class="text-xs text-gray-600">pH</p>
            </div>
          </div>

          {/* NPK Status */}
          <div class="grid grid-cols-3 gap-2 text-sm mb-3">
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-gray-600">N</span>
              <span
                class={`font-medium ${
                  soil.nitrogen === "Adequate" || soil.nitrogen === "High"
                    ? "text-green-600"
                    : soil.nitrogen === "Moderate"
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {soil.nitrogen}
              </span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-gray-600">P</span>
              <span
                class={`font-medium ${
                  soil.phosphorus === "Adequate" || soil.phosphorus === "High"
                    ? "text-green-600"
                    : soil.phosphorus === "Moderate"
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {soil.phosphorus}
              </span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
              <span class="text-gray-600">K</span>
              <span
                class={`font-medium ${
                  soil.potassium === "Adequate" || soil.potassium === "High"
                    ? "text-green-600"
                    : soil.potassium === "Moderate"
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {soil.potassium}
              </span>
            </div>
          </div>

          {/* Extended Soil Info (from Bhuvan/NBSS) */}
          {(soil.texture || soil.soilOrder || soil.organicCarbon) && (
            <div class="border-t pt-3 mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">
                Soil Profile
              </p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                {soil.texture && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">Texture</span>
                    <span class="font-medium">{soil.texture}</span>
                  </div>
                )}
                {soil.soilOrder && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">Type</span>
                    <span class="font-medium">{soil.soilOrder}</span>
                  </div>
                )}
                {soil.organicCarbon && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">Organic Carbon</span>
                    <span class="font-medium">
                      {soil.organicCarbon.toFixed(1)} g/kg
                    </span>
                  </div>
                )}
                {soil.drainage && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">Drainage</span>
                    <span class="font-medium capitalize">{soil.drainage}</span>
                  </div>
                )}
                {soil.electricalConductivity !== undefined && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">EC</span>
                    <span class="font-medium">
                      {soil.electricalConductivity.toFixed(2)} dS/m
                    </span>
                  </div>
                )}
                {soil.fertility && (
                  <div class="flex justify-between">
                    <span class="text-gray-500">Fertility</span>
                    <span
                      class={`font-medium capitalize ${
                        soil.fertility === "high"
                          ? "text-green-600"
                          : soil.fertility === "medium"
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {soil.fertility}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risk Indicators */}
          {(soil.erosionRisk || soil.salinityRisk || soil.waterloggingRisk) && (
            <div class="border-t pt-3 mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">
                Risk Assessment
              </p>
              <div class="flex flex-wrap gap-2">
                {soil.erosionRisk && soil.erosionRisk !== "none" && (
                  <span
                    class={`px-2 py-1 rounded-full text-xs ${
                      soil.erosionRisk === "severe"
                        ? "bg-red-100 text-red-700"
                        : soil.erosionRisk === "moderate"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    Erosion: {soil.erosionRisk}
                  </span>
                )}
                {soil.salinityRisk && soil.salinityRisk !== "none" && (
                  <span
                    class={`px-2 py-1 rounded-full text-xs ${
                      soil.salinityRisk === "severe"
                        ? "bg-red-100 text-red-700"
                        : soil.salinityRisk === "moderate"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    Salinity: {soil.salinityRisk}
                  </span>
                )}
                {soil.waterloggingRisk && soil.waterloggingRisk !== "none" && (
                  <span
                    class={`px-2 py-1 rounded-full text-xs ${
                      soil.waterloggingRisk === "severe"
                        ? "bg-red-100 text-red-700"
                        : soil.waterloggingRisk === "moderate"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    Waterlogging: {soil.waterloggingRisk}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Amendments & Recommendations */}
          {soil.amendments && soil.amendments.length > 0 && (
            <div class="border-t pt-3 mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">
                Soil Health Recommendations
              </p>
              <ul class="text-xs text-gray-700 space-y-1">
                {soil.amendments.map((a, i) => (
                  <li key={i} class="flex items-start gap-2">
                    <span class="text-green-500">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suitable Crops */}
          {soil.suitableCrops && soil.suitableCrops.length > 0 && (
            <div class="border-t pt-3 mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">
                Suitable Crops for This Soil
              </p>
              <div class="flex flex-wrap gap-1">
                {soil.suitableCrops.map((c, i) => (
                  <span
                    key={i}
                    class="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full capitalize"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Crop Recommendation Engine — ranked by soil + weather + satellite data */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <span>🌾</span> What Should I Plant?
          </h3>
          <p class="text-xs text-gray-500 mb-3">
            Crops ranked for this farm — tap any crop to see why
          </p>
          <CropRecommendations farmId={farm.id} />
        </div>

        {/* Crop Details */}
        {crop && (
          <div class="bg-white rounded-xl border p-4 mb-4">
            <h3 class="font-semibold text-gray-900 mb-3">Crop Details</h3>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-gray-500">Crop</p>
                <p class="font-medium">
                  {cropLabels[crop.cropType] || crop.cropType}
                </p>
              </div>
              <div>
                <p class="text-gray-500">Stage</p>
                <p class="font-medium">{crop.stage}</p>
              </div>
              <div>
                <p class="text-gray-500">Sowing Date</p>
                <p class="font-medium">{crop.sowingDate}</p>
              </div>
              <div>
                <p class="text-gray-500">Days After Sowing</p>
                <p class="font-medium">{crop.daysAfterSowing} days</p>
              </div>
              <div>
                <p class="text-gray-500">Expected Harvest</p>
                <p class="font-medium">{crop.expectedHarvest}</p>
              </div>
              <div>
                <p class="text-gray-500">Expected Yield</p>
                <p class="font-medium">{crop.expectedYield} quintal</p>
              </div>
            </div>
          </div>
        )}

        {/* AI-Based Input Recommendations */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span class="text-lg">🧪</span>
            Recommended Farm Inputs
          </h3>
          <p class="text-xs text-gray-500 mb-3">
            Based on{" "}
            {crop ? cropLabels[crop.cropType] || crop.cropType : "your crop"},
            {" "}
            {farm.soilType} soil, {farm.areaHectares.toFixed(1)}{" "}
            ha area, and current conditions
          </p>

          {/* Fertilizer Recommendations */}
          <div class="mb-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <span>🌱</span> Fertilizers
            </h4>
            <div class="space-y-2">
              {/* Urea */}
              <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-gray-900">Urea (46% N)</span>
                  <span class="text-sm font-bold text-green-700">
                    {Math.round(
                      farm.areaHectares * (soil.nitrogen === "Low" ? 120 : 80),
                    )} kg
                  </span>
                </div>
                <p class="text-xs text-gray-600">
                  {soil.nitrogen === "Low"
                    ? "High dose recommended - Nitrogen deficiency detected"
                    : crop?.stage === "Vegetative" || crop?.stage === "Seedling"
                    ? "Apply in 2 splits: 50% now, 50% after 20 days"
                    : "Standard dose for current growth stage"}
                </p>
                <p class="text-xs text-green-700 mt-1">
                  Est. cost: ₹{Math.round(
                    farm.areaHectares * (soil.nitrogen === "Low" ? 120 : 80) *
                      6,
                  )}
                </p>
              </div>

              {/* DAP */}
              <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-gray-900">DAP (18-46-0)</span>
                  <span class="text-sm font-bold text-blue-700">
                    {Math.round(
                      farm.areaHectares *
                        (soil.phosphorus === "Low" ? 100 : 50),
                    )} kg
                  </span>
                </div>
                <p class="text-xs text-gray-600">
                  {soil.phosphorus === "Low" || soil.phosphorus === "Moderate"
                    ? "Apply as basal dose before sowing/transplanting"
                    : "Maintenance dose for healthy root development"}
                </p>
                <p class="text-xs text-blue-700 mt-1">
                  Est. cost: ₹{Math.round(
                    farm.areaHectares * (soil.phosphorus === "Low" ? 100 : 50) *
                      27,
                  )}
                </p>
              </div>

              {/* MOP */}
              <div class="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-gray-900">MOP (60% K₂O)</span>
                  <span class="text-sm font-bold text-orange-700">
                    {Math.round(farm.areaHectares * 40)} kg
                  </span>
                </div>
                <p class="text-xs text-gray-600">
                  Essential for{" "}
                  {crop?.cropType === "cotton" || crop?.cropType === "sugarcane"
                    ? "fiber quality and yield"
                    : crop?.cropType === "rice" || crop?.cropType === "wheat"
                    ? "grain filling and disease resistance"
                    : "overall plant health and yield"}
                </p>
                <p class="text-xs text-orange-700 mt-1">
                  Est. cost: ₹{Math.round(farm.areaHectares * 40 * 17)}
                </p>
              </div>
            </div>
          </div>

          {/* Micronutrients */}
          {(soil.nitrogen === "Low" || stats.healthScore < 60) && (
            <div class="mb-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <span>💧</span> Micronutrients & Supplements
              </h4>
              <div class="grid grid-cols-2 gap-2">
                <div class="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p class="font-medium text-sm text-gray-900">Zinc Sulphate</p>
                  <p class="text-xs text-gray-600">
                    {Math.round(farm.areaHectares * 25)} kg
                  </p>
                  <p class="text-xs text-yellow-700">
                    For micronutrient deficiency
                  </p>
                </div>
                <div class="p-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <p class="font-medium text-sm text-gray-900">Humic Acid</p>
                  <p class="text-xs text-gray-600">
                    {Math.round(farm.areaHectares * 5)} L
                  </p>
                  <p class="text-xs text-purple-700">Improve nutrient uptake</p>
                </div>
              </div>
            </div>
          )}

          {/* Pesticides/Plant Protection */}
          {(crop?.stage === "Vegetative" || crop?.stage === "Flowering") && (
            <div class="mb-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <span>🛡️</span> Plant Protection
              </h4>
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="font-medium text-gray-900 text-sm">
                  {crop?.cropType === "rice"
                    ? "Carbendazim + Mancozeb"
                    : crop?.cropType === "cotton"
                    ? "Imidacloprid"
                    : crop?.cropType === "wheat"
                    ? "Propiconazole"
                    : "Neem Oil (Organic)"}
                </p>
                <p class="text-xs text-gray-600 mt-1">
                  {crop?.cropType === "rice"
                    ? "For blast and sheath blight prevention"
                    : crop?.cropType === "cotton"
                    ? "For whitefly and jassid control"
                    : crop?.cropType === "wheat"
                    ? "For rust disease prevention"
                    : "General pest deterrent - safe for beneficial insects"}
                </p>
                <p class="text-xs text-red-700 mt-1">
                  Spray during: {weather && weather.forecast.find((f) =>
                      f.rain === 0
                    )
                    ? "Clear weather expected"
                    : "Wait for dry conditions"}
                </p>
              </div>
            </div>
          )}

          {/* Irrigation Advisory */}
          {weather && (
            <div class="mb-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <span>💧</span> Irrigation Advisory
              </h4>
              <div
                class={`p-3 rounded-lg border ${
                  weather.rainfall7d > 30
                    ? "bg-blue-50 border-blue-200"
                    : weather.rainfall7d < 10
                    ? "bg-red-50 border-red-200"
                    : "bg-green-50 border-green-200"
                }`}
              >
                <p class="font-medium text-gray-900 text-sm">
                  {weather.rainfall7d > 30
                    ? "Skip irrigation - Adequate rainfall"
                    : weather.rainfall7d < 10
                    ? "Urgent: Schedule irrigation within 2 days"
                    : "Light irrigation if soil moisture drops"}
                </p>
                <p class="text-xs text-gray-600 mt-1">
                  {farm.waterSource === "drip"
                    ? `Drip: Run for ${Math.round(farm.areaHectares * 2)} hours`
                    : farm.waterSource === "canal"
                    ? `Canal: ${
                      Math.round(farm.areaHectares * 500)
                    } cubic meters needed`
                    : `${farm.waterSource}: Adjust based on soil moisture (${soil.moisture}%)`}
                </p>
              </div>
            </div>
          )}

          {/* Cost Summary */}
          <div class="mt-4 p-3 bg-gray-100 rounded-lg">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-700">
                Estimated Total Input Cost
              </span>
              <span class="text-lg font-bold text-primary-600">
                ₹{Math.round(
                  farm.areaHectares * (soil.nitrogen === "Low" ? 120 : 80) * 6 +
                    farm.areaHectares * 50 * 27 +
                    farm.areaHectares * 40 * 17,
                ).toLocaleString()}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              For {farm.areaHectares.toFixed(1)}{" "}
              hectares | Prices may vary by location
            </p>
          </div>
        </div>

        {/* Product Recommendations */}
        {recommendations.length > 0 && (
          <div class="bg-white rounded-xl border p-4 mb-4">
            <h3 class="font-semibold text-gray-900 mb-3">
              Available Products Nearby
            </h3>
            <div class="space-y-2">
              {recommendations.filter((r) => !r.isCrossSell).map((rec) => (
                <div
                  key={rec.id}
                  class="flex items-center justify-between p-2 bg-green-50 rounded-lg"
                >
                  <div>
                    <p class="font-medium text-gray-900 text-sm">{rec.name}</p>
                    <p class="text-xs text-gray-500">{rec.reason}</p>
                  </div>
                  <p class="font-bold text-green-600">₹{rec.price}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Farm Map */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-3">Farm Location</h3>
          <FarmMapPreview
            center={{ lat: farm.lat, lng: farm.lon }}
            polygon={farm.polygon}
            farmName={farm.name}
            height="200px"
          />
          <div class="mt-2 text-xs text-gray-500 flex justify-between">
            <span>📍 {farm.village}, {farm.district}</span>
            <span>{farm.lat.toFixed(4)}°N, {farm.lon.toFixed(4)}°E</span>
          </div>
        </div>

        {/* Farm Info */}
        <div class="bg-white rounded-xl border p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-3">Farm Information</h3>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-gray-500">Area</p>
              <p class="font-medium">{farm.areaHectares.toFixed(2)} hectares</p>
            </div>
            <div>
              <p class="text-gray-500">Location</p>
              <p class="font-medium">{farm.village}, {farm.district}</p>
            </div>
            <div>
              <p class="text-gray-500">Soil Type</p>
              <p class="font-medium capitalize">
                {farm.soilType.replace("_", " ")}
              </p>
            </div>
            <div>
              <p class="text-gray-500">Water Source</p>
              <p class="font-medium capitalize">{farm.waterSource}</p>
            </div>
            <div>
              <p class="text-gray-500">Verified</p>
              <p class="font-medium">{farm.isVerified ? "Yes" : "No"}</p>
            </div>
            <div>
              <p class="text-gray-500">State</p>
              <p class="font-medium">{farm.state}</p>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Export Script */}
      {/* deno-lint-ignore react-no-danger */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.getElementById('export-pdf-btn')?.addEventListener('click', async () => {
            const farmName = ${JSON.stringify(farm.name)};
            const agriScoreVal = ${agriScore.overall};
            const healthScore = ${agriScore.health};
            const soilScore = ${agriScore.soil};
            const waterScore = ${agriScore.water};
            const managementScore = ${agriScore.management};
            const latestNdvi = ${stats.latestNdvi.toFixed(3)};
            const ndviTrend = "${stats.ndviTrend || "stable"}";
            const rainfall7d = ${stats.totalRainfall7d.toFixed(1)};
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(\`
              <!DOCTYPE html>
              <html>
              <head>
                <title>\${farmName} - Comprehensive Farm Report</title>
                <style>
                  * { box-sizing: border-box; margin: 0; padding: 0; }
                  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 850px; margin: 0 auto; color: #1f2937; line-height: 1.5; }
                  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 25px; }
                  .header-left h1 { color: #059669; font-size: 28px; margin-bottom: 5px; }
                  .header-left p { color: #6b7280; font-size: 12px; }
                  .header-right { text-align: right; }
                  .header-right .date { font-size: 12px; color: #6b7280; }
                  .header-right .report-id { font-size: 10px; color: #9ca3af; }
                  
                  .score-card { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
                  .score-main { text-align: center; }
                  .score-main .score { font-size: 64px; font-weight: 700; line-height: 1; }
                  .score-main .label { font-size: 14px; opacity: 0.9; margin-top: 5px; }
                  .score-main .grade { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-top: 8px; }
                  .score-breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                  .score-item { text-align: center; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; }
                  .score-item .value { font-size: 24px; font-weight: 600; }
                  .score-item .name { font-size: 11px; opacity: 0.8; }
                  
                  .section { background: #f9fafb; border-radius: 10px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
                  .section-title { font-size: 16px; font-weight: 600; color: #374151; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; display: flex; align-items: center; gap: 8px; }
                  .section-title::before { content: ''; width: 4px; height: 20px; background: #059669; border-radius: 2px; }
                  
                  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
                  .info-item { background: white; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb; }
                  .info-item .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
                  .info-item .value { font-size: 15px; font-weight: 600; color: #111827; margin-top: 4px; }
                  
                  .health-status { display: flex; gap: 20px; margin-top: 15px; }
                  .health-item { flex: 1; text-align: center; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e5e7eb; }
                  .health-item.good { border-color: #10b981; background: #ecfdf5; }
                  .health-item.warning { border-color: #f59e0b; background: #fffbeb; }
                  .health-item.bad { border-color: #ef4444; background: #fef2f2; }
                  .health-item .metric { font-size: 28px; font-weight: 700; }
                  .health-item .metric-label { font-size: 12px; color: #6b7280; }
                  
                  .crop-stage { display: flex; align-items: center; gap: 10px; margin: 15px 0; }
                  .stage-bar { flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
                  .stage-progress { height: 100%; background: linear-gradient(90deg, #10b981 0%, #059669 100%); border-radius: 4px; }
                  
                  .recommendations { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-top: 15px; }
                  .recommendations h4 { color: #92400e; font-size: 13px; margin-bottom: 10px; }
                  .recommendations ul { padding-left: 20px; color: #78350f; font-size: 13px; }
                  .recommendations li { margin-bottom: 5px; }
                  
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
                  .footer-left { font-size: 11px; color: #6b7280; }
                  .footer-right { font-size: 10px; color: #9ca3af; }
                  
                  @media print { 
                    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    .section { break-inside: avoid; }
                  }
                </style>
              </head>
              <body>
                <div class="header">
                  <div class="header-left">
                    <h1>🌾 Khetscope Farm Report</h1>
                    <p>Satellite-Based Agricultural Intelligence</p>
                  </div>
                  <div class="header-right">
                    <div class="date">\${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div class="report-id">Report ID: CFR-\${Date.now().toString(36).toUpperCase()}</div>
                  </div>
                </div>
                
                <h2 style="font-size: 22px; margin-bottom: 20px;">\${farmName}</h2>
                
                <div class="score-card">
                  <div class="score-main">
                    <div class="score">\${agriScoreVal}</div>
                    <div class="label">Agri Score</div>
                    <div class="grade">\${agriScoreVal >= 80 ? 'Grade A - Excellent' : agriScoreVal >= 60 ? 'Grade B - Good' : agriScoreVal >= 40 ? 'Grade C - Average' : 'Grade D - Needs Attention'}</div>
                  </div>
                  <div class="score-breakdown">
                    <div class="score-item"><div class="value">\${healthScore}</div><div class="name">Health</div></div>
                    <div class="score-item"><div class="value">\${soilScore}</div><div class="name">Soil</div></div>
                    <div class="score-item"><div class="value">\${waterScore}</div><div class="name">Water</div></div>
                    <div class="score-item"><div class="value">\${managementScore}</div><div class="name">Mgmt</div></div>
                  </div>
                </div>
                
                <div class="section">
                  <div class="section-title">Farm Information</div>
                  <div class="info-grid">
                    <div class="info-item"><div class="label">Farm Area</div><div class="value">${
            farm.areaHectares.toFixed(2)
          } Hectares</div></div>
                    <div class="info-item"><div class="label">Village</div><div class="value">${farm.village}</div></div>
                    <div class="info-item"><div class="label">District</div><div class="value">${farm.district}</div></div>
                    <div class="info-item"><div class="label">State</div><div class="value">${farm.state}</div></div>
                    <div class="info-item"><div class="label">Soil Type</div><div class="value" style="text-transform: capitalize;">${
            farm.soilType.replace("_", " ")
          }</div></div>
                    <div class="info-item"><div class="label">Water Source</div><div class="value" style="text-transform: capitalize;">${farm.waterSource}</div></div>
                  </div>
                </div>
                
                ${
            crop
              ? `
                <div class="section">
                  <div class="section-title">Current Crop Status</div>
                  <div class="info-grid">
                    <div class="info-item"><div class="label">Crop Type</div><div class="value">${
                cropLabels[crop.cropType] || crop.cropType
              }</div></div>
                    <div class="info-item"><div class="label">Variety</div><div class="value">${crop.variety}</div></div>
                    <div class="info-item"><div class="label">Season</div><div class="value" style="text-transform: capitalize;">${crop.season}</div></div>
                    <div class="info-item"><div class="label">Sowing Date</div><div class="value">${crop.sowingDate}</div></div>
                    <div class="info-item"><div class="label">Days After Sowing</div><div class="value">${crop.daysAfterSowing} days</div></div>
                    <div class="info-item"><div class="label">Growth Stage</div><div class="value">${crop.stage}</div></div>
                  </div>
                  <div class="crop-stage">
                    <span style="font-size: 12px; color: #6b7280;">Progress:</span>
                    <div class="stage-bar"><div class="stage-progress" style="width: ${
                Math.min((crop.daysAfterSowing / 120) * 100, 100)
              }%;"></div></div>
                    <span style="font-size: 12px; color: #6b7280;">${crop.expectedHarvest}</span>
                  </div>
                  <div class="info-grid" style="margin-top: 15px;">
                    <div class="info-item"><div class="label">Expected Harvest</div><div class="value">${crop.expectedHarvest}</div></div>
                    <div class="info-item"><div class="label">Expected Yield</div><div class="value">${crop.expectedYield} Quintal</div></div>
                    <div class="info-item"><div class="label">Irrigation</div><div class="value" style="text-transform: capitalize;">${crop.irrigationType}</div></div>
                  </div>
                </div>
                `
              : ""
          }
                
                <div class="section">
                  <div class="section-title">Health Metrics (Satellite Analysis)</div>
                  <div class="health-status">
                    <div class="health-item \${latestNdvi >= 0.6 ? 'good' : latestNdvi >= 0.4 ? 'warning' : 'bad'}">
                      <div class="metric">\${latestNdvi}</div>
                      <div class="metric-label">Current NDVI</div>
                    </div>
                    <div class="health-item \${ndviTrend === 'improving' ? 'good' : ndviTrend === 'declining' ? 'bad' : 'warning'}">
                      <div class="metric" style="text-transform: capitalize;">\${ndviTrend}</div>
                      <div class="metric-label">NDVI Trend</div>
                    </div>
                    <div class="health-item \${rainfall7d > 20 ? 'good' : rainfall7d > 5 ? 'warning' : 'bad'}">
                      <div class="metric">\${rainfall7d} mm</div>
                      <div class="metric-label">7-Day Rainfall</div>
                    </div>
                  </div>
                  
                  <div class="recommendations">
                    <h4>📋 AI Recommendations</h4>
                    <ul>
                      \${healthScore < 60 ? '<li>Consider additional nutrient application to boost crop health</li>' : ''}
                      \${ndviTrend === 'declining' ? '<li>Monitor for pest/disease issues - NDVI is declining</li>' : ''}
                      \${rainfall7d < 10 ? '<li>Schedule irrigation within next 2-3 days due to low rainfall</li>' : ''}
                      \${healthScore >= 70 && ndviTrend !== 'declining' ? '<li>Continue current farming practices - crop is healthy</li>' : ''}
                      <li>Next satellite update expected in 3-5 days</li>
                    </ul>
                  </div>
                </div>
                
                <div class="section">
                  <div class="section-title">Soil Analysis ${
            soil.sources
              ? `<span style="font-size:10px;color:#6b7280;font-weight:normal;">(${
                soil.sources.join(", ")
              })</span>`
              : ""
          }</div>
                  <div class="info-grid">
                    <div class="info-item"><div class="label">Soil Moisture</div><div class="value">${soil.moisture}%</div></div>
                    <div class="info-item"><div class="label">Soil Temperature</div><div class="value">${soil.temperature}°C</div></div>
                    <div class="info-item"><div class="label">Soil pH</div><div class="value">${
            soil.ph.toFixed(1)
          }</div></div>
                    <div class="info-item"><div class="label">Nitrogen (N)</div><div class="value">${soil.nitrogen}</div></div>
                    <div class="info-item"><div class="label">Phosphorus (P)</div><div class="value">${soil.phosphorus}</div></div>
                    <div class="info-item"><div class="label">Potassium (K)</div><div class="value">${soil.potassium}</div></div>
                    ${
            soil.texture
              ? `<div class="info-item"><div class="label">Texture</div><div class="value">${soil.texture}</div></div>`
              : ""
          }
                    ${
            soil.soilOrder
              ? `<div class="info-item"><div class="label">Soil Type</div><div class="value">${soil.soilOrder}</div></div>`
              : ""
          }
                    ${
            soil.organicCarbon
              ? `<div class="info-item"><div class="label">Organic Carbon</div><div class="value">${
                soil.organicCarbon.toFixed(1)
              } g/kg</div></div>`
              : ""
          }
                    ${
            soil.drainage
              ? `<div class="info-item"><div class="label">Drainage</div><div class="value" style="text-transform:capitalize;">${soil.drainage}</div></div>`
              : ""
          }
                    ${
            soil.fertility
              ? `<div class="info-item"><div class="label">Fertility</div><div class="value" style="text-transform:capitalize;">${soil.fertility}</div></div>`
              : ""
          }
                    ${
            soil.electricalConductivity !== undefined
              ? `<div class="info-item"><div class="label">EC</div><div class="value">${
                soil.electricalConductivity.toFixed(2)
              } dS/m</div></div>`
              : ""
          }
                  </div>
                  ${
            (soil.erosionRisk && soil.erosionRisk !== "none") ||
              (soil.salinityRisk && soil.salinityRisk !== "none") ||
              (soil.waterloggingRisk && soil.waterloggingRisk !== "none")
              ? `
                  <div style="margin-top:15px;padding:10px;background:#fef2f2;border-radius:8px;">
                    <div style="font-weight:600;color:#991b1b;margin-bottom:5px;">⚠️ Risk Assessment</div>
                    <div style="font-size:12px;color:#7f1d1d;">
                      ${
                soil.erosionRisk && soil.erosionRisk !== "none"
                  ? `<span style="margin-right:15px;">Erosion: ${soil.erosionRisk}</span>`
                  : ""
              }
                      ${
                soil.salinityRisk && soil.salinityRisk !== "none"
                  ? `<span style="margin-right:15px;">Salinity: ${soil.salinityRisk}</span>`
                  : ""
              }
                      ${
                soil.waterloggingRisk && soil.waterloggingRisk !== "none"
                  ? `<span>Waterlogging: ${soil.waterloggingRisk}</span>`
                  : ""
              }
                    </div>
                  </div>`
              : ""
          }
                  ${
            soil.amendments && soil.amendments.length > 0
              ? `
                  <div style="margin-top:15px;padding:10px;background:#f0fdf4;border-radius:8px;">
                    <div style="font-weight:600;color:#166534;margin-bottom:5px;">🌱 Soil Health Recommendations</div>
                    <ul style="font-size:12px;color:#15803d;margin:0;padding-left:20px;">
                      ${soil.amendments.map((a) => `<li>${a}</li>`).join("")}
                    </ul>
                  </div>`
              : ""
          }
                  ${
            soil.fertilizerRecommendation
              ? `
                  <div style="margin-top:15px;padding:10px;background:#eff6ff;border-radius:8px;">
                    <div style="font-weight:600;color:#1e40af;margin-bottom:5px;">🧪 Fertilizer Recommendation (kg/ha)</div>
                    <div style="font-size:14px;color:#1d4ed8;">
                      <span style="margin-right:20px;">N: ${soil.fertilizerRecommendation.n}</span>
                      <span style="margin-right:20px;">P: ${soil.fertilizerRecommendation.p}</span>
                      <span>K: ${soil.fertilizerRecommendation.k}</span>
                    </div>
                  </div>`
              : ""
          }
                  ${
            soil.suitableCrops && soil.suitableCrops.length > 0
              ? `
                  <div style="margin-top:15px;">
                    <div style="font-size:11px;color:#6b7280;margin-bottom:5px;">Suitable Crops for This Soil:</div>
                    <div style="font-size:12px;">${
                soil.suitableCrops.map((c) =>
                  `<span style="display:inline-block;padding:2px 8px;margin:2px;background:#dcfce7;color:#166534;border-radius:12px;text-transform:capitalize;">${c}</span>`
                ).join("")
              }</div>
                  </div>`
              : ""
          }
                </div>
                
                <div class="footer">
                  <div class="footer-left">
                    <strong>Khetscope</strong> - Satellite-based Agricultural Advisory Platform<br/>
                    Empowering farmers with intelligent insights
                  </div>
                  <div class="footer-right">
                    Report generated: \${new Date().toLocaleDateString('en-IN')}<br/>
                    For queries: support@khetscope.agri | Helpline: 1800-XXX-XXXX
                  </div>
                </div>
              </body>
              </html>
            \`);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 500);
          });
        `,
        }}
      />
    </AppShell>
  );
}
