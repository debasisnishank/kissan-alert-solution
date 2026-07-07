import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import { getCurrentFarmHealth } from "$lib/satellite/ndvi_extractor.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { type FarmAnalysisResult, getGeminiClient } from "$ai/gemini.ts";
import { getCropStage } from "$lib/config.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

interface AnalyzePageData {
  farm: { id: string; name: string; district: string; state: string };
  crop: { type: string; stage: string; sowingDate: string } | null;
  health: {
    ndvi: number;
    evi: number;
    healthScore: number;
    stressIndicators: string[];
  };
  analysis: FarmAnalysisResult | null;
  error: string | null;
  aiAvailable: boolean;
}

export const handler: Handlers<AnalyzePageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params;
    const { session } = ctx.state;

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    const crop = await getActiveCropByFarm(farm.id);
    const gemini = getGeminiClient();

    let analysis: FarmAnalysisResult | null = null;
    let error: string | null = null;
    let health = {
      ndvi: 0,
      evi: 0,
      healthScore: 0,
      stressIndicators: [] as string[],
    };

    // Calculate crop stage
    let cropStage = "Unknown";
    let sowingDateStr = "Unknown";
    if (crop?.sowingDate) {
      const sowingDate = new Date(crop.sowingDate);
      sowingDateStr = sowingDate.toLocaleDateString("en-IN");
      const daysAfterSowing = Math.floor(
        (Date.now() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const stage = getCropStage(crop.cropType, daysAfterSowing);
      cropStage = stage?.name || "Unknown";
    }

    try {
      // Get farm health
      const polygon = farm.polygon;
      health = await getCurrentFarmHealth(
        polygon,
        crop?.cropType || "unknown",
        crop?.sowingDate ? new Date(crop.sowingDate) : undefined,
      );

      // Get AI analysis if available
      if (gemini.isAvailable()) {
        // Calculate centroid
        const coords = polygon.coordinates[0];
        const centroid = {
          lat: coords.reduce((s: number, c: number[]) => s + c[1], 0) /
            coords.length,
          lon: coords.reduce((s: number, c: number[]) => s + c[0], 0) /
            coords.length,
        };

        // Get weather
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
              humidity: 60,
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

        analysis = await gemini.analyzeFarmHealth({
          farmName: farm.name,
          cropType: crop?.cropType || "unknown",
          cropStage,
          sowingDate: sowingDateStr,
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
          soilType: farm.soilType || undefined,
          irrigationType: crop?.irrigationType || farm.waterSource || undefined,
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Analysis failed";
    }

    return ctx.render({
      farm: {
        id: farm.id,
        name: farm.name,
        district: farm.district || "Unknown",
        state: farm.state || "Unknown",
      },
      crop: crop
        ? { type: crop.cropType, stage: cropStage, sowingDate: sowingDateStr }
        : null,
      health,
      analysis,
      error,
      aiAvailable: gemini.isAvailable(),
    });
  },
};

export default function AnalyzePage({ data }: PageProps<AnalyzePageData>) {
  const { farm, crop, health, analysis, error, aiAvailable } = data;

  const severityColors: Record<string, string> = {
    high: "bg-red-100 text-red-800 border-red-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    low: "bg-green-100 text-green-800 border-green-200",
  };

  const priorityColors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-yellow-500",
    low: "bg-green-500",
  };

  return (
    <AppShell title={`AI Analysis - ${farm.name}`} showBack>
      {/* Health Summary */}
      <div class="bg-gradient-to-r from-primary-600 to-primary-500 rounded-xl p-4 text-white mb-4">
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="text-primary-100 text-sm">{crop?.type || "No crop"}</p>
            <p class="text-lg font-semibold">{crop?.stage || "Not planted"}</p>
          </div>
          <div class="text-right">
            <p class="text-3xl font-bold">{health.healthScore.toFixed(0)}%</p>
            <p class="text-primary-100 text-sm">Health Score</p>
          </div>
        </div>
        <div class="flex gap-4 text-sm">
          <span>NDVI: {health.ndvi.toFixed(2)}</span>
          <span>EVI: {health.evi.toFixed(2)}</span>
        </div>
      </div>

      {/* Stress Indicators */}
      {health.stressIndicators.length > 0 && (
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
          <p class="text-sm font-medium text-orange-800 mb-1">
            Stress Detected:
          </p>
          <div class="flex flex-wrap gap-2">
            {health.stressIndicators.map((s) => (
              <span
                key={s}
                class="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs"
              >
                {s.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      {!aiAvailable
        ? (
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
            <svg
              class="w-12 h-12 text-gray-400 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p class="text-gray-600 font-medium">AI Analysis Not Available</p>
            <p class="text-sm text-gray-500 mt-1">
              Configure Vertex AI access to enable AI-powered recommendations
            </p>
          </div>
        )
        : error
        ? (
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <p class="text-red-800 font-medium">Analysis Error</p>
            <p class="text-sm text-red-600">{error}</p>
          </div>
        )
        : analysis
        ? (
          <div class="space-y-4">
            {/* Summary */}
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <h3 class="font-semibold text-gray-900 mb-2">Summary</h3>
              <p class="text-sm text-gray-700">{analysis.summary}</p>
            </div>

            {/* Health Assessment */}
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <h3 class="font-semibold text-gray-900 mb-2">
                Health Assessment
              </h3>
              <p class="text-sm text-gray-700">{analysis.healthAssessment}</p>
            </div>

            {/* Risks */}
            {analysis.risks && analysis.risks.length > 0 && (
              <div class="bg-white rounded-lg border border-gray-200 p-4">
                <h3 class="font-semibold text-gray-900 mb-3">
                  Risks Identified
                </h3>
                <div class="space-y-2">
                  {analysis.risks.map((risk, i) => (
                    <div
                      key={i}
                      class={`p-3 rounded-lg border ${
                        severityColors[risk.severity] || severityColors.low
                      }`}
                    >
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium capitalize">{risk.type}</span>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-white/50">
                          {risk.severity}
                        </span>
                      </div>
                      <p class="text-sm">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 &&
              (
                <div class="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 class="font-semibold text-gray-900 mb-3">
                    Recommendations
                  </h3>
                  <div class="space-y-3">
                    {analysis.recommendations.map((rec, i) => (
                      <div key={i} class="flex gap-3">
                        <div
                          class={`w-2 h-2 rounded-full mt-2 ${
                            priorityColors[rec.priority]
                          }`}
                        />
                        <div class="flex-1">
                          <p class="text-sm font-medium text-gray-900 capitalize">
                            {rec.category.replace(/_/g, " ")}
                          </p>
                          <p class="text-sm text-gray-700">{rec.action}</p>
                          <p class="text-xs text-gray-500 mt-1">
                            When: {rec.timing}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Yield & Market */}
            <div class="grid grid-cols-2 gap-4">
              {analysis.yieldPrediction && (
                <div class="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 class="font-semibold text-gray-900 mb-2 text-sm">
                    Yield Outlook
                  </h3>
                  <p class="text-xs text-gray-700">
                    {analysis.yieldPrediction}
                  </p>
                </div>
              )}
              {analysis.marketAdvice && (
                <div class="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 class="font-semibold text-gray-900 mb-2 text-sm">
                    Market Advice
                  </h3>
                  <p class="text-xs text-gray-700">{analysis.marketAdvice}</p>
                </div>
              )}
            </div>
          </div>
        )
        : (
          <div class="bg-gray-50 rounded-lg p-8 text-center">
            <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p class="text-gray-600">Analyzing your farm...</p>
          </div>
        )}

      {/* Back Link */}
      <div class="mt-6">
        <a
          href={`/app/farm/${farm.id}`}
          class="block text-center text-primary-600 font-medium py-2"
        >
          ← Back to {farm.name}
        </a>
      </div>
    </AppShell>
  );
}
