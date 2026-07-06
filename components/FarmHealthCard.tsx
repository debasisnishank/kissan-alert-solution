interface FarmHealthCardProps {
  farmName: string;
  cropType: string;
  stage: string;
  healthScore: number;
  ndvi: number;
  ndviTrend: "improving" | "stable" | "declining" | null;
  lastUpdate: string;
  daysAfterSowing: number;
}

export function FarmHealthCard({
  farmName,
  cropType,
  stage,
  healthScore: rawHealthScore,
  ndvi: rawNdvi,
  ndviTrend,
  lastUpdate,
  daysAfterSowing,
}: FarmHealthCardProps) {
  // Ensure numeric values
  const healthScore = Number(rawHealthScore) || 0;
  const ndvi = Number(rawNdvi) || 0;
  const getHealthColor = (score: number) => {
    if (score >= 75) return "text-green-600 bg-green-100";
    if (score >= 50) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getTrendIcon = (trend: string | null) => {
    if (trend === "improving") {
      return (
        <svg
          class="w-4 h-4 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 10l7-7m0 0l7 7m-7-7v18"
          />
        </svg>
      );
    }
    if (trend === "declining") {
      return (
        <svg
          class="w-4 h-4 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      );
    }
    return (
      <svg
        class="w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 12h14"
        />
      </svg>
    );
  };

  const cropLabels: Record<string, string> = {
    rice: "Rice",
    wheat: "Wheat",
    maize: "Maize",
    cotton: "Cotton",
    soybean: "Soybean",
    sugarcane: "Sugarcane",
    groundnut: "Groundnut",
  };

  return (
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div class="bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3 text-white">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">{farmName}</h3>
            <p class="text-sm text-primary-100">
              {cropLabels[cropType] || cropType} - {stage}
            </p>
          </div>
          <div
            class={`px-3 py-1 rounded-full text-sm font-bold ${
              getHealthColor(healthScore)
            }`}
          >
            {healthScore.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div class="grid grid-cols-3 divide-x divide-gray-100 p-4">
        <div class="text-center">
          <div class="flex items-center justify-center gap-1">
            <span class="text-lg font-bold text-gray-900">
              {ndvi.toFixed(2)}
            </span>
            {getTrendIcon(ndviTrend)}
          </div>
          <p class="text-xs text-gray-500 mt-1">NDVI</p>
        </div>
        <div class="text-center">
          <span class="text-lg font-bold text-gray-900">{daysAfterSowing}</span>
          <p class="text-xs text-gray-500 mt-1">Days</p>
        </div>
        <div class="text-center">
          <span class="text-lg font-bold text-gray-900">
            {stage.slice(0, 3)}
          </span>
          <p class="text-xs text-gray-500 mt-1">Stage</p>
        </div>
      </div>

      {/* Footer */}
      <div class="bg-gray-50 px-4 py-2 flex items-center justify-between">
        <span class="text-xs text-gray-500">Last updated: {lastUpdate}</span>
        <a
          href="/app/farm"
          class="text-xs text-primary-600 font-medium hover:text-primary-700"
        >
          View Details →
        </a>
      </div>
    </div>
  );
}
