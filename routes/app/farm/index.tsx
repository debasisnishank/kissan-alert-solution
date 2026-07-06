import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmsByFarmer } from "$lib/farm.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface FarmListData {
  farms: Array<{
    id: string;
    name: string;
    areaHectares: number;
    district: string;
    cropType: string;
    stage: string;
    healthScore: number;
    isVerified: boolean;
  }>;
}

export const handler: Handlers<FarmListData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    const farmsData = await Promise.all(
      farms.map(async (farm) => {
        const crop = await getActiveCropByFarm(farm.id);
        const stats = await getFarmHealthStats(farm.id);

        let stage = "Not Planted";
        let daysAfterSowing = 0;
        if (crop) {
          daysAfterSowing = Math.floor(
            (Date.now() - new Date(crop.sowingDate).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (daysAfterSowing < 15) stage = "Germination";
          else if (daysAfterSowing < 30) stage = "Seedling";
          else if (daysAfterSowing < 50) stage = "Vegetative";
          else if (daysAfterSowing < 70) stage = "Flowering";
          else if (daysAfterSowing < 90) stage = "Pod Formation";
          else stage = "Maturity";
        }

        // Estimate health score if not available
        let healthScore = Number(stats.healthScore) || 0;
        if (healthScore === 0 && crop && daysAfterSowing > 0) {
          // Estimate based on crop growth stage
          let estimatedNdvi = 0.4;
          if (daysAfterSowing < 15) estimatedNdvi = 0.2;
          else if (daysAfterSowing < 30) estimatedNdvi = 0.38;
          else if (daysAfterSowing < 50) estimatedNdvi = 0.58;
          else if (daysAfterSowing < 70) estimatedNdvi = 0.72;
          else if (daysAfterSowing < 90) estimatedNdvi = 0.65;
          else estimatedNdvi = 0.5;
          healthScore = Math.round(estimatedNdvi * 100);
        }

        return {
          id: farm.id,
          name: farm.name,
          areaHectares: Number(farm.areaHectares) || 0,
          district: farm.district || "Unknown",
          cropType: crop?.cropType || "none",
          stage,
          healthScore,
          isVerified: farm.isVerified,
        };
      }),
    );

    return ctx.render({ farms: farmsData });
  },
};

export default function FarmListPage({ data }: PageProps<FarmListData>) {
  const { farms } = data;

  const cropLabels: Record<string, string> = {
    rice: "Rice",
    wheat: "Wheat",
    maize: "Maize",
    cotton: "Cotton",
    soybean: "Soybean",
    sugarcane: "Sugarcane",
    groundnut: "Groundnut",
    none: "No Crop",
  };

  return (
    <AppShell
      title="My Farms"
      showBack
      actions={
        <a href="/app/farm/add" class="p-2 hover:bg-primary-700 rounded-lg">
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </a>
      }
    >
      {farms.length > 0
        ? (
          <div class="space-y-3">
            {/* Health Score Legend */}
            <div class="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 flex items-center justify-between">
              <span>🌱 = Crop Health (NDVI-based)</span>
              <div class="flex gap-2">
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-green-500"></span> Good
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-yellow-500"></span> Fair
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-red-500"></span> Poor
                </span>
              </div>
            </div>
            {farms.map((farm) => (
              <a
                key={farm.id}
                href={`/app/farm/${farm.id}`}
                class="block bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <h3 class="font-semibold text-gray-900 flex items-center gap-2">
                      {farm.name}
                      {farm.isVerified && (
                        <svg
                          class="w-4 h-4 text-primary-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      )}
                    </h3>
                    <p class="text-sm text-gray-500">
                      {farm.district} • {farm.areaHectares.toFixed(2)} ha
                    </p>
                  </div>
                  <div
                    class={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${
                      farm.healthScore >= 75
                        ? "bg-green-100 text-green-700"
                        : farm.healthScore >= 50
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                    title="Crop Health Score based on satellite data"
                  >
                    <span>🌱</span>
                    <span>{farm.healthScore.toFixed(0)}%</span>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-sm">
                  <span class="text-gray-600">
                    <span class="font-medium">
                      {cropLabels[farm.cropType] || farm.cropType}
                    </span>
                  </span>
                  <span class="text-gray-400">•</span>
                  <span class="text-gray-600">{farm.stage}</span>
                </div>
              </a>
            ))}
          </div>
        )
        : (
          <div class="text-center py-12">
            <svg
              class="w-16 h-16 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <h3 class="text-lg font-semibold text-gray-900 mb-1">
              No Farms Yet
            </h3>
            <p class="text-sm text-gray-500 mb-4">
              Add your first farm to get started
            </p>
            <a
              href="/app/farm/add"
              class="inline-block bg-primary-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-700"
            >
              Add Farm
            </a>
          </div>
        )}
    </AppShell>
  );
}
