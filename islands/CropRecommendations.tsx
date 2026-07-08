import { useEffect, useState } from "preact/hooks";

interface FactorScore {
  factor: string;
  score: number;
  weight: number;
  detail: string;
}

interface Recommendation {
  cropId: string;
  name: string;
  nameHi: string;
  category: string;
  score: number;
  verdict: "highly_suitable" | "suitable" | "marginal" | "not_recommended";
  seasons: string[];
  durationDays: number;
  factors: FactorScore[];
  warnings: string[];
}

interface DataCited {
  ph: number;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  texture: string | null;
  soilMoisturePct: number;
  forecastRainfallMm: number;
  forecastDays: number;
  forecastAvgTempC: number;
  latestNdvi: number | null;
  ndviTrend: string | null;
  waterSource: string | null;
  groundwaterPotential: string | null;
  sources: string[];
}

interface ApiResponse {
  season: string;
  recommendations: Recommendation[];
  dataCited: DataCited;
}

const VERDICT_STYLES: Record<Recommendation["verdict"], string> = {
  highly_suitable: "bg-green-100 text-green-800",
  suitable: "bg-lime-100 text-lime-800",
  marginal: "bg-yellow-100 text-yellow-800",
  not_recommended: "bg-red-100 text-red-700",
};

const VERDICT_LABELS: Record<Recommendation["verdict"], string> = {
  highly_suitable: "Highly suitable",
  suitable: "Suitable",
  marginal: "Marginal",
  not_recommended: "Not recommended",
};

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 60) return "bg-lime-500";
  if (score >= 45) return "bg-yellow-500";
  return "bg-red-400";
}

export default function CropRecommendations({ farmId }: { farmId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/crops/recommend/${farmId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [farmId]);

  if (error) {
    return (
      <div class="text-sm text-red-600 py-4">
        Could not load crop recommendations: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div class="py-6 text-center text-sm text-gray-400 animate-pulse">
        Scoring crops against soil, weather and satellite data…
      </div>
    );
  }

  const top = data.recommendations.slice(0, 5);
  const d = data.dataCited;

  return (
    <div class="space-y-3">
      {/* Data snapshot the scores are based on */}
      <div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
        Scored for the <span class="font-medium capitalize">{data.season}</span>
        {" "}
        season using: soil pH <span class="font-medium">{d.ph}</span>, N{" "}
        <span class="font-medium">{d.nitrogen}</span> / P{" "}
        <span class="font-medium">{d.phosphorus}</span> / K{" "}
        <span class="font-medium">{d.potassium}</span>
        {d.texture && (
          <>
            , texture <span class="font-medium capitalize">{d.texture}</span>
          </>
        )}, moisture{" "}
        <span class="font-medium">{d.soilMoisturePct}%</span>, forecast{" "}
        <span class="font-medium">
          {d.forecastRainfallMm}mm rain / {d.forecastDays}d
        </span>, avg temp{" "}
        <span class="font-medium">{d.forecastAvgTempC}°C</span>
        {d.latestNdvi != null && (
          <>
            , field NDVI{" "}
            <span class="font-medium">
              {Number(d.latestNdvi).toFixed(2)}
              {d.ndviTrend ? ` (${d.ndviTrend})` : ""}
            </span>
          </>
        )}
        {d.groundwaterPotential != null && (
          <>
            , groundwater{" "}
            <span class="font-medium capitalize">{d.groundwaterPotential}</span>
          </>
        )}
        {d.sources.length > 0 && (
          <>
            {" "}· Sources: {d.sources.join(", ")}
          </>
        )}
      </div>

      {top.map((rec, i) => (
        <div
          key={rec.cropId}
          class="border rounded-lg overflow-hidden bg-white"
        >
          <button
            type="button"
            class="w-full text-left p-3 hover:bg-gray-50"
            onClick={() =>
              setExpanded(expanded === rec.cropId ? null : rec.cropId)}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-semibold text-gray-400 w-4">
                  {i + 1}
                </span>
                <span class="font-medium text-sm text-gray-900 truncate">
                  {rec.name}{" "}
                  <span class="text-gray-400 font-normal">{rec.nameHi}</span>
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span
                  class={`px-2 py-0.5 text-xs rounded-full ${
                    VERDICT_STYLES[rec.verdict]
                  }`}
                >
                  {VERDICT_LABELS[rec.verdict]}
                </span>
                <span class="text-sm font-semibold text-gray-700 w-8 text-right">
                  {rec.score}
                </span>
              </div>
            </div>
            <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                class={`h-full rounded-full ${scoreColor(rec.score)}`}
                style={{ width: `${rec.score}%` }}
              />
            </div>
            {rec.warnings.length > 0 && (
              <p class="mt-1.5 text-xs text-amber-600">
                ⚠ {rec.warnings[0]}
              </p>
            )}
            {/* Per-recommendation citation: key factor scores at a glance */}
            <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {rec.factors.map((f) => (
                <span key={f.factor}>
                  {f.factor === "Soil pH"
                    ? "pH"
                    : f.factor === "Water availability"
                    ? "Water"
                    : f.factor === "Temperature"
                    ? "Temp"
                    : f.factor === "Nutrients (NPK)"
                    ? "NPK"
                    : f.factor === "Soil texture"
                    ? "Texture"
                    : f.factor === "Season"
                    ? "Season"
                    : f.factor}:{" "}
                  <span class="font-medium">{Math.round(f.score * 100)}%</span>
                </span>
              ))}
              <span>
                Score: <span class="font-medium">{rec.score}/100</span>
              </span>
            </div>
          </button>

          {expanded === rec.cropId && (
            <div class="border-t bg-gray-50 p-3 space-y-2">
              {rec.factors.map((f) => (
                <div key={f.factor} class="text-xs">
                  <div class="flex items-center justify-between mb-0.5">
                    <span class="font-medium text-gray-700">
                      {f.factor}{" "}
                      <span class="text-gray-400">({f.weight}%)</span>
                    </span>
                    <span class="text-gray-500">
                      {Math.round(f.score * f.weight)}/{f.weight}
                    </span>
                  </div>
                  <p class="text-gray-600 leading-relaxed">{f.detail}</p>
                </div>
              ))}
              {rec.warnings.length > 1 && (
                <div class="text-xs text-amber-600 space-y-1 pt-1 border-t">
                  {rec.warnings.slice(1).map((w) => <p key={w}>⚠ {w}</p>)}
                </div>
              )}
              <p class="text-xs text-gray-400 pt-1 border-t">
                Season: {rec.seasons.join(", ")} · Duration: ~{rec.durationDays}
                {" "}
                days
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
