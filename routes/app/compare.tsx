import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmsByFarmer } from "$lib/farm.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface FarmComparison {
  id: string;
  name: string;
  district: string;
  area: number;
  cropType: string;
  stage: string;
  healthScore: number;
  ndvi: number;
  ndviTrend: string;
  rainfall7d: number;
  daysAfterSowing: number;
}

interface ComparePageData {
  farms: FarmComparison[];
  selectedFarms: string[];
}

export const handler: Handlers<ComparePageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const selectedFarms = url.searchParams.getAll("farm");

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    const farmsData: FarmComparison[] = await Promise.all(
      farms.map(async (farm) => {
        const crop = await getActiveCropByFarm(farm.id);
        const stats = await getFarmHealthStats(farm.id);

        let daysAfterSowing = 0;
        let stage = "Not Planted";
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
        }

        return {
          id: farm.id,
          name: farm.name,
          district: farm.district || "Unknown",
          area: farm.areaHectares,
          cropType: crop?.cropType || "None",
          stage,
          healthScore: Number(stats.healthScore) || 0,
          ndvi: Number(stats.latestNdvi) || 0,
          ndviTrend: stats.ndviTrend || "stable",
          rainfall7d: Number(stats.totalRainfall7d) || 0,
          daysAfterSowing,
        };
      }),
    );

    return ctx.render({
      farms: farmsData,
      selectedFarms,
    });
  },
};

export default function ComparePage({ data }: PageProps<ComparePageData>) {
  const { farms, selectedFarms } = data;
  const selectedFarmsData = selectedFarms.length > 0
    ? farms.filter((f) => selectedFarms.includes(f.id))
    : farms.slice(0, 3);

  const metrics = [
    {
      key: "healthScore",
      label: "Health Score",
      unit: "",
      color: "green",
      format: (v: number) => v.toFixed(0),
    },
    {
      key: "ndvi",
      label: "NDVI",
      unit: "",
      color: "blue",
      format: (v: number) => v.toFixed(3),
    },
    {
      key: "area",
      label: "Area",
      unit: " ha",
      color: "purple",
      format: (v: number) => v.toFixed(1),
    },
    {
      key: "rainfall7d",
      label: "7-day Rainfall",
      unit: " mm",
      color: "cyan",
      format: (v: number) => v.toFixed(1),
    },
    {
      key: "daysAfterSowing",
      label: "Days After Sowing",
      unit: "",
      color: "orange",
      format: (v: number) => v.toFixed(0),
    },
  ];

  const maxValues: Record<string, number> = {};
  metrics.forEach((m) => {
    maxValues[m.key] = Math.max(
      ...selectedFarmsData.map((f) =>
        f[m.key as keyof FarmComparison] as number
      ),
      1,
    );
  });

  return (
    <AppShell title="Compare Farms" showBack>
      {/* Farm Selection */}
      <div class="bg-white rounded-xl border p-4 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">
          Select Farms to Compare
        </h3>
        <form method="GET" class="flex flex-wrap gap-2">
          {farms.map((farm) => (
            <label
              key={farm.id}
              class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
            >
              <input
                type="checkbox"
                name="farm"
                value={farm.id}
                checked={selectedFarmsData.some((f) => f.id === farm.id)}
                class="rounded text-primary-600"
              />
              <span class="text-sm">{farm.name}</span>
            </label>
          ))}
          <button
            type="submit"
            class="ml-auto px-4 py-2 bg-primary-600 text-white text-sm rounded-lg font-medium"
          >
            Compare
          </button>
        </form>
      </div>

      {selectedFarmsData.length === 0
        ? (
          <div class="bg-white rounded-xl p-8 text-center border">
            <p class="text-gray-500">Select at least one farm to compare</p>
          </div>
        )
        : (
          <>
            {/* Farm Cards */}
            <div class="grid grid-cols-1 gap-3 mb-4">
              {selectedFarmsData.map((farm, idx) => {
                const colors = [
                  "bg-green-500",
                  "bg-blue-500",
                  "bg-purple-500",
                  "bg-orange-500",
                ];
                return (
                  <div key={farm.id} class="bg-white rounded-xl border p-4">
                    <div class="flex items-center gap-3 mb-3">
                      <div
                        class={`w-3 h-3 rounded-full ${
                          colors[idx % colors.length]
                        }`}
                      />
                      <div class="flex-1">
                        <h4 class="font-semibold text-gray-900">{farm.name}</h4>
                        <p class="text-xs text-gray-500">
                          {farm.district} - {farm.cropType}
                        </p>
                      </div>
                      <div
                        class={`px-2 py-1 rounded text-xs font-medium ${
                          farm.healthScore >= 70
                            ? "bg-green-100 text-green-700"
                            : farm.healthScore >= 50
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {farm.healthScore.toFixed(0)} Health
                      </div>
                    </div>
                    <div class="grid grid-cols-4 gap-2 text-center text-xs">
                      <div class="p-2 bg-gray-50 rounded">
                        <p class="font-semibold text-gray-900">
                          {farm.ndvi.toFixed(3)}
                        </p>
                        <p class="text-gray-500">NDVI</p>
                      </div>
                      <div class="p-2 bg-gray-50 rounded">
                        <p class="font-semibold text-gray-900">
                          {farm.area.toFixed(1)} ha
                        </p>
                        <p class="text-gray-500">Area</p>
                      </div>
                      <div class="p-2 bg-gray-50 rounded">
                        <p class="font-semibold text-gray-900">{farm.stage}</p>
                        <p class="text-gray-500">Stage</p>
                      </div>
                      <div class="p-2 bg-gray-50 rounded">
                        <p class="font-semibold text-gray-900">
                          {farm.rainfall7d.toFixed(0)} mm
                        </p>
                        <p class="text-gray-500">Rain (7d)</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparison Chart */}
            <div class="bg-white rounded-xl border p-4 mb-4">
              <h3 class="font-semibold text-gray-900 mb-4">
                Metric Comparison
              </h3>
              <div class="space-y-4">
                {metrics.map((metric) => (
                  <div key={metric.key}>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm text-gray-600">{metric.label}</span>
                    </div>
                    <div class="space-y-1">
                      {selectedFarmsData.map((farm, idx) => {
                        const value =
                          farm[metric.key as keyof FarmComparison] as number;
                        const percentage = (value / maxValues[metric.key]) *
                          100;
                        const colors = [
                          "bg-green-500",
                          "bg-blue-500",
                          "bg-purple-500",
                          "bg-orange-500",
                        ];
                        return (
                          <div key={farm.id} class="flex items-center gap-2">
                            <span class="w-20 text-xs text-gray-500 truncate">
                              {farm.name}
                            </span>
                            <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                class={`h-full ${
                                  colors[idx % colors.length]
                                } rounded-full transition-all`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span class="w-16 text-xs font-medium text-gray-900 text-right">
                              {metric.format(value)}
                              {metric.unit}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Table */}
            <div class="bg-white rounded-xl border overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left font-medium text-gray-500">
                      Metric
                    </th>
                    {selectedFarmsData.map((farm) => (
                      <th
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-500"
                      >
                        {farm.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr>
                    <td class="px-4 py-3 text-gray-600">Crop</td>
                    {selectedFarmsData.map((farm) => (
                      <td
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-900 capitalize"
                      >
                        {farm.cropType}
                      </td>
                    ))}
                  </tr>
                  <tr class="bg-gray-50">
                    <td class="px-4 py-3 text-gray-600">Stage</td>
                    {selectedFarmsData.map((farm) => (
                      <td
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-900"
                      >
                        {farm.stage}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td class="px-4 py-3 text-gray-600">Health Score</td>
                    {selectedFarmsData.map((farm) => (
                      <td key={farm.id} class="px-4 py-3 text-right">
                        <span
                          class={`font-bold ${
                            farm.healthScore >= 70
                              ? "text-green-600"
                              : farm.healthScore >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {farm.healthScore.toFixed(0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr class="bg-gray-50">
                    <td class="px-4 py-3 text-gray-600">NDVI</td>
                    {selectedFarmsData.map((farm) => (
                      <td
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-900"
                      >
                        {farm.ndvi.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td class="px-4 py-3 text-gray-600">NDVI Trend</td>
                    {selectedFarmsData.map((farm) => (
                      <td key={farm.id} class="px-4 py-3 text-right">
                        <span
                          class={`px-2 py-0.5 rounded text-xs font-medium ${
                            farm.ndviTrend === "improving"
                              ? "bg-green-100 text-green-700"
                              : farm.ndviTrend === "declining"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {farm.ndviTrend}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr class="bg-gray-50">
                    <td class="px-4 py-3 text-gray-600">Area (ha)</td>
                    {selectedFarmsData.map((farm) => (
                      <td
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-900"
                      >
                        {farm.area.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td class="px-4 py-3 text-gray-600">7-day Rainfall (mm)</td>
                    {selectedFarmsData.map((farm) => (
                      <td
                        key={farm.id}
                        class="px-4 py-3 text-right font-medium text-gray-900"
                      >
                        {farm.rainfall7d.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
    </AppShell>
  );
}
