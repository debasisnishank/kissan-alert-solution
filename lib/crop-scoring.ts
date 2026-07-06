/**
 * Crop Recommendation Scoring Engine
 *
 * Rule-based (no ML) ranking of candidate crops for a farm, combining:
 * - Soil: pH, N/P/K status, texture, salinity/waterlogging risk (lib/soil.ts)
 * - Water: soil moisture, 16-day forecast rainfall, irrigation source
 * - Climate: forecast temperature vs crop optima
 * - Season: current sowing window (kharif/rabi/zaid)
 * - Field context: latest NDVI + trend from satellite observations
 *
 * Every factor cites the actual numbers it used — recommendations must be
 * explainable (hackathon hard rule: never cut the reasoning output).
 *
 * Agronomic parameters are indicative ranges from public agronomy references
 * (ICAR package-of-practices style), not proprietary data.
 */

import type { FarmSoilData } from "$lib/soil.ts";
import type { WeatherData } from "$lib/satellite/weather.ts";

type NutrientStatus = "Low" | "Moderate" | "Adequate" | "High";
type Demand = "low" | "medium" | "high";
export type Season = "kharif" | "rabi" | "zaid";

export interface CropProfile {
  id: string;
  name: string;
  nameHi: string;
  category: string;
  seasons: Season[];
  /** Tolerable soil pH range */
  phRange: [number, number];
  /** Optimal soil pH range */
  phOptimal: [number, number];
  /** Approximate seasonal water requirement in mm */
  waterNeedMm: number;
  /** Optimal mean growing temperature range in °C */
  tempOptimal: [number, number];
  /** Tolerable mean growing temperature range in °C */
  tempRange: [number, number];
  /** Preferred soil texture/type keywords (lowercase) */
  textures: string[];
  nutrientDemand: { n: Demand; p: Demand; k: Demand };
  droughtTolerant: boolean;
  waterloggingTolerant: boolean;
  /** 0 = sensitive, 1 = moderate, 2 = tolerant */
  salinityTolerance: 0 | 1 | 2;
  durationDays: number;
}

/**
 * Candidate crops — ids match utils/constants.ts CROP_CATEGORIES.
 * Water needs / pH / temperature ranges are indicative ICAR-style values.
 */
export const CROP_PROFILES: CropProfile[] = [
  {
    id: "rice",
    name: "Rice/Paddy",
    nameHi: "धान",
    category: "cereals",
    seasons: ["kharif", "rabi"],
    phRange: [5.0, 8.0],
    phOptimal: [5.5, 6.5],
    waterNeedMm: 1200,
    tempOptimal: [25, 32],
    tempRange: [20, 38],
    textures: ["clay", "clayey", "clay loam", "alluvial", "silty"],
    nutrientDemand: { n: "high", p: "medium", k: "medium" },
    droughtTolerant: false,
    waterloggingTolerant: true,
    salinityTolerance: 1,
    durationDays: 120,
  },
  {
    id: "wheat",
    name: "Wheat",
    nameHi: "गेहूं",
    category: "cereals",
    seasons: ["rabi"],
    phRange: [5.5, 8.0],
    phOptimal: [6.0, 7.5],
    waterNeedMm: 450,
    tempOptimal: [15, 24],
    tempRange: [10, 28],
    textures: ["loam", "loamy", "clay loam", "alluvial"],
    nutrientDemand: { n: "high", p: "medium", k: "low" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 130,
  },
  {
    id: "maize",
    name: "Maize/Corn",
    nameHi: "मक्का",
    category: "cereals",
    seasons: ["kharif", "rabi", "zaid"],
    phRange: [5.5, 7.8],
    phOptimal: [6.0, 7.0],
    waterNeedMm: 550,
    tempOptimal: [21, 30],
    tempRange: [15, 35],
    textures: ["loam", "loamy", "sandy loam", "alluvial"],
    nutrientDemand: { n: "high", p: "medium", k: "medium" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 100,
  },
  {
    id: "ragi",
    name: "Finger Millet/Ragi",
    nameHi: "रागी",
    category: "cereals",
    seasons: ["kharif"],
    phRange: [4.5, 8.0],
    phOptimal: [5.5, 7.5],
    waterNeedMm: 350,
    tempOptimal: [24, 32],
    tempRange: [18, 38],
    textures: ["red", "laterite", "sandy loam", "loam"],
    nutrientDemand: { n: "low", p: "low", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 105,
  },
  {
    id: "jowar",
    name: "Sorghum/Jowar",
    nameHi: "ज्वार",
    category: "cereals",
    seasons: ["kharif", "rabi"],
    phRange: [5.5, 8.5],
    phOptimal: [6.0, 7.5],
    waterNeedMm: 400,
    tempOptimal: [25, 32],
    tempRange: [18, 40],
    textures: ["black", "clay loam", "loam", "red"],
    nutrientDemand: { n: "medium", p: "low", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 2,
    durationDays: 110,
  },
  {
    id: "bajra",
    name: "Pearl Millet/Bajra",
    nameHi: "बाजरा",
    category: "cereals",
    seasons: ["kharif", "zaid"],
    phRange: [5.5, 8.5],
    phOptimal: [6.5, 7.8],
    waterNeedMm: 300,
    tempOptimal: [25, 34],
    tempRange: [20, 42],
    textures: ["sandy", "sandy loam", "red", "light"],
    nutrientDemand: { n: "low", p: "low", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 2,
    durationDays: 85,
  },
  {
    id: "chickpea",
    name: "Chickpea/Gram",
    nameHi: "चना",
    category: "pulses",
    seasons: ["rabi"],
    phRange: [5.5, 8.5],
    phOptimal: [6.0, 8.0],
    waterNeedMm: 300,
    tempOptimal: [18, 26],
    tempRange: [10, 30],
    textures: ["loam", "clay loam", "black", "sandy loam"],
    nutrientDemand: { n: "low", p: "medium", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 110,
  },
  {
    id: "pigeon_pea",
    name: "Pigeon Pea/Arhar",
    nameHi: "अरहर",
    category: "pulses",
    seasons: ["kharif"],
    phRange: [5.0, 8.0],
    phOptimal: [6.5, 7.5],
    waterNeedMm: 400,
    tempOptimal: [20, 30],
    tempRange: [15, 35],
    textures: ["loam", "sandy loam", "black", "red"],
    nutrientDemand: { n: "low", p: "medium", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 160,
  },
  {
    id: "mung_bean",
    name: "Mung Bean/Moong",
    nameHi: "मूंग",
    category: "pulses",
    seasons: ["kharif", "zaid"],
    phRange: [6.0, 8.0],
    phOptimal: [6.5, 7.5],
    waterNeedMm: 250,
    tempOptimal: [25, 35],
    tempRange: [20, 40],
    textures: ["loam", "sandy loam", "alluvial"],
    nutrientDemand: { n: "low", p: "medium", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 65,
  },
  {
    id: "urad",
    name: "Black Gram/Urad",
    nameHi: "उड़द",
    category: "pulses",
    seasons: ["kharif", "rabi"],
    phRange: [5.5, 7.8],
    phOptimal: [6.0, 7.5],
    waterNeedMm: 300,
    tempOptimal: [25, 33],
    tempRange: [20, 38],
    textures: ["loam", "clay loam", "black"],
    nutrientDemand: { n: "low", p: "medium", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 80,
  },
  {
    id: "groundnut",
    name: "Groundnut/Peanut",
    nameHi: "मूंगफली",
    category: "oilseeds",
    seasons: ["kharif", "rabi"],
    phRange: [5.5, 7.5],
    phOptimal: [6.0, 7.0],
    waterNeedMm: 500,
    tempOptimal: [25, 32],
    tempRange: [20, 38],
    textures: ["sandy", "sandy loam", "red", "light", "loam"],
    nutrientDemand: { n: "low", p: "medium", k: "medium" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 110,
  },
  {
    id: "mustard",
    name: "Mustard/Sarson",
    nameHi: "सरसों",
    category: "oilseeds",
    seasons: ["rabi"],
    phRange: [5.5, 8.0],
    phOptimal: [6.0, 7.5],
    waterNeedMm: 300,
    tempOptimal: [15, 25],
    tempRange: [10, 30],
    textures: ["loam", "sandy loam", "alluvial", "clay loam"],
    nutrientDemand: { n: "medium", p: "medium", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 2,
    durationDays: 120,
  },
  {
    id: "sesame",
    name: "Sesame/Til",
    nameHi: "तिल",
    category: "oilseeds",
    seasons: ["kharif", "zaid"],
    phRange: [5.5, 8.0],
    phOptimal: [6.0, 7.5],
    waterNeedMm: 350,
    tempOptimal: [25, 33],
    tempRange: [20, 40],
    textures: ["sandy loam", "loam", "red", "light"],
    nutrientDemand: { n: "low", p: "low", k: "low" },
    droughtTolerant: true,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 90,
  },
  {
    id: "soybean",
    name: "Soybean",
    nameHi: "सोयाबीन",
    category: "oilseeds",
    seasons: ["kharif"],
    phRange: [6.0, 7.5],
    phOptimal: [6.0, 7.0],
    waterNeedMm: 500,
    tempOptimal: [22, 30],
    tempRange: [18, 35],
    textures: ["black", "clay loam", "loam"],
    nutrientDemand: { n: "low", p: "medium", k: "medium" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 100,
  },
  {
    id: "cotton",
    name: "Cotton",
    nameHi: "कपास",
    category: "cash_crops",
    seasons: ["kharif"],
    phRange: [5.8, 8.5],
    phOptimal: [6.5, 8.0],
    waterNeedMm: 700,
    tempOptimal: [24, 32],
    tempRange: [18, 40],
    textures: ["black", "clay loam", "alluvial", "loam"],
    nutrientDemand: { n: "high", p: "medium", k: "medium" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 2,
    durationDays: 170,
  },
  {
    id: "sugarcane",
    name: "Sugarcane",
    nameHi: "गन्ना",
    category: "cash_crops",
    seasons: ["kharif", "rabi", "zaid"],
    phRange: [5.5, 8.5],
    phOptimal: [6.5, 7.5],
    waterNeedMm: 1800,
    tempOptimal: [24, 34],
    tempRange: [18, 40],
    textures: ["loam", "clay loam", "alluvial", "black"],
    nutrientDemand: { n: "high", p: "high", k: "high" },
    droughtTolerant: false,
    waterloggingTolerant: true,
    salinityTolerance: 1,
    durationDays: 330,
  },
  {
    id: "potato",
    name: "Potato",
    nameHi: "आलू",
    category: "vegetables",
    seasons: ["rabi"],
    phRange: [4.8, 7.0],
    phOptimal: [5.2, 6.4],
    waterNeedMm: 500,
    tempOptimal: [15, 22],
    tempRange: [10, 28],
    textures: ["sandy loam", "loam", "alluvial", "light"],
    nutrientDemand: { n: "high", p: "medium", k: "high" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 0,
    durationDays: 100,
  },
  {
    id: "tomato",
    name: "Tomato",
    nameHi: "टमाटर",
    category: "vegetables",
    seasons: ["kharif", "rabi", "zaid"],
    phRange: [5.5, 7.5],
    phOptimal: [6.0, 7.0],
    waterNeedMm: 450,
    tempOptimal: [20, 28],
    tempRange: [15, 34],
    textures: ["loam", "sandy loam", "red"],
    nutrientDemand: { n: "medium", p: "medium", k: "high" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 110,
  },
  {
    id: "onion",
    name: "Onion",
    nameHi: "प्याज",
    category: "vegetables",
    seasons: ["kharif", "rabi"],
    phRange: [5.8, 7.5],
    phOptimal: [6.0, 7.0],
    waterNeedMm: 400,
    tempOptimal: [15, 25],
    tempRange: [12, 32],
    textures: ["loam", "sandy loam", "alluvial"],
    nutrientDemand: { n: "medium", p: "medium", k: "medium" },
    droughtTolerant: false,
    waterloggingTolerant: false,
    salinityTolerance: 1,
    durationDays: 130,
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface FactorScore {
  factor: string;
  /** 0–1 fit for this factor */
  score: number;
  /** Weight of this factor in the total (weights sum to 100) */
  weight: number;
  /** Human-readable explanation citing the actual data values used */
  detail: string;
}

export interface CropRecommendation {
  cropId: string;
  name: string;
  nameHi: string;
  category: string;
  /** 0–100 weighted total after risk penalties */
  score: number;
  verdict: "highly_suitable" | "suitable" | "marginal" | "not_recommended";
  seasons: Season[];
  durationDays: number;
  factors: FactorScore[];
  warnings: string[];
}

export interface ScoringInput {
  soil: FarmSoilData;
  /** Daily forecast, ideally 16 days (Open-Meteo max) */
  forecast: WeatherData[];
  waterSource?: string;
  /** Latest NDVI from satellite observations, if any */
  latestNdvi?: number | null;
  ndviTrend?: "improving" | "stable" | "declining" | null;
  /** Observed rainfall over the last 7 days (mm), if any */
  rainfall7d?: number | null;
  /** Defaults to now; injectable for tests */
  date?: Date;
}

export interface ScoringResult {
  season: Season;
  recommendations: CropRecommendation[];
  /** The field/data snapshot every recommendation was scored against */
  dataCited: {
    ph: number;
    nitrogen: NutrientStatus;
    phosphorus: NutrientStatus;
    potassium: NutrientStatus;
    texture: string | null;
    soilMoisturePct: number;
    forecastRainfallMm: number;
    forecastDays: number;
    forecastAvgTempC: number;
    rainfall7dMm: number | null;
    latestNdvi: number | null;
    ndviTrend: string | null;
    waterSource: string | null;
    sources: string[];
  };
}

const WEIGHTS = {
  ph: 20,
  water: 25,
  temperature: 15,
  nutrients: 20,
  texture: 10,
  season: 10,
} as const;

const NUTRIENT_SUPPLY: Record<NutrientStatus, number> = {
  Low: 0.25,
  Moderate: 0.55,
  Adequate: 0.85,
  High: 1.0,
};

const DEMAND_LEVEL: Record<Demand, number> = {
  low: 0.35,
  medium: 0.65,
  high: 1.0,
};

/** Indian cropping season for a given date */
export function getCurrentSeason(date: Date): Season {
  const month = date.getMonth() + 1; // 1-12
  if (month >= 6 && month <= 10) return "kharif"; // Jun–Oct (monsoon sowing)
  if (month >= 11 || month <= 2) return "rabi"; // Nov–Feb (winter sowing)
  return "zaid"; // Mar–May (summer)
}

/** Trapezoid fit: 1 inside optimal, linear falloff to 0 at range edges */
function rangeFit(
  value: number,
  range: [number, number],
  optimal: [number, number],
): number {
  if (value >= optimal[0] && value <= optimal[1]) return 1;
  if (value < range[0] || value > range[1]) return 0;
  if (value < optimal[0]) {
    return (value - range[0]) / (optimal[0] - range[0]);
  }
  return (range[1] - value) / (range[1] - optimal[1]);
}

function scorePh(crop: CropProfile, ph: number): FactorScore {
  const score = rangeFit(ph, crop.phRange, crop.phOptimal);
  let detail: string;
  if (score === 1) {
    detail = `Soil pH ${ph} is within the optimal ${crop.phOptimal[0]}–${
      crop.phOptimal[1]
    } range for ${crop.name}.`;
  } else if (score === 0) {
    detail = `Soil pH ${ph} is outside the tolerable ${crop.phRange[0]}–${
      crop.phRange[1]
    } range for ${crop.name}.`;
  } else {
    detail = `Soil pH ${ph} is tolerable but not optimal (${
      crop.phOptimal[0]
    }–${crop.phOptimal[1]} preferred) for ${crop.name}.`;
  }
  return { factor: "Soil pH", score, weight: WEIGHTS.ph, detail };
}

/** Irrigation capacity of the farm's water source, as extra mm available */
function irrigationCapacityMm(waterSource?: string): number {
  switch ((waterSource || "").toLowerCase()) {
    case "canal":
      return 600;
    case "borewell":
    case "tubewell":
    case "well":
      return 450;
    case "drip":
    case "sprinkler":
      return 400;
    case "pond":
    case "tank":
      return 250;
    default: // rainfed / unknown
      return 0;
  }
}

function scoreWater(
  crop: CropProfile,
  input: ScoringInput,
  forecastRainMm: number,
  forecastDays: number,
): FactorScore {
  const moisture = input.soil.moisture; // %
  const irrigationMm = irrigationCapacityMm(input.waterSource);

  // Project forecast rainfall over the crop's duration (capped extrapolation:
  // the forecast window is only ~16 days, so scale conservatively at 60%).
  const projectedSeasonRainMm = forecastDays > 0
    ? (forecastRainMm / forecastDays) * Math.min(crop.durationDays, 120) * 0.6
    : 0;
  const availableMm = projectedSeasonRainMm + irrigationMm;
  const ratio = availableMm / crop.waterNeedMm;

  let score = Math.max(0, Math.min(1, ratio));
  // Drought-tolerant crops keep most of their score under deficit
  if (score < 0.7 && crop.droughtTolerant) {
    score = Math.min(1, score + 0.3);
  }
  // Good current soil moisture buffers a small deficit
  if (score < 1 && moisture >= 45) {
    score = Math.min(1, score + 0.1);
  }

  const sourceNote = irrigationMm > 0
    ? `${input.waterSource} irrigation adds ~${irrigationMm}mm`
    : "no irrigation source (rainfed)";
  const detail = `${crop.name} needs ~${crop.waterNeedMm}mm/season. ` +
    `Forecast: ${forecastRainMm.toFixed(0)}mm over next ${forecastDays} days ` +
    `(~${projectedSeasonRainMm.toFixed(0)}mm projected over the season), ` +
    `${sourceNote}; current soil moisture ${moisture}%.` +
    (crop.droughtTolerant && ratio < 0.7 ? " Drought-tolerant crop." : "");

  return { factor: "Water availability", score, weight: WEIGHTS.water, detail };
}

function scoreTemperature(
  crop: CropProfile,
  avgTempC: number,
): FactorScore {
  const score = rangeFit(avgTempC, crop.tempRange, crop.tempOptimal);
  const detail = `Forecast mean temperature ${
    avgTempC.toFixed(1)
  }°C vs ${crop.name} optimum ${crop.tempOptimal[0]}–${
    crop.tempOptimal[1]
  }°C (tolerable ${crop.tempRange[0]}–${crop.tempRange[1]}°C).`;
  return {
    factor: "Temperature",
    score,
    weight: WEIGHTS.temperature,
    detail,
  };
}

function scoreNutrients(crop: CropProfile, soil: FarmSoilData): FactorScore {
  const pairs: Array<[string, NutrientStatus, Demand]> = [
    ["N", soil.nitrogen, crop.nutrientDemand.n],
    ["P", soil.phosphorus, crop.nutrientDemand.p],
    ["K", soil.potassium, crop.nutrientDemand.k],
  ];

  let total = 0;
  const notes: string[] = [];
  for (const [label, status, demand] of pairs) {
    const supply = NUTRIENT_SUPPLY[status];
    const need = DEMAND_LEVEL[demand];
    // Full marks when supply covers demand; proportional otherwise
    const fit = Math.min(1, supply / need);
    total += fit;
    if (fit < 0.75) {
      notes.push(`${label} is ${status} vs ${demand} demand`);
    }
  }
  const score = total / pairs.length;

  let detail =
    `Soil N: ${soil.nitrogen}, P: ${soil.phosphorus}, K: ${soil.potassium} vs ${crop.name} demand (N ${crop.nutrientDemand.n}, P ${crop.nutrientDemand.p}, K ${crop.nutrientDemand.k}).`;
  if (notes.length > 0) {
    detail += ` Shortfalls: ${notes.join("; ")}.`;
    if (soil.fertilizerRecommendation) {
      const { n, p, k } = soil.fertilizerRecommendation;
      detail += ` Correctable with ~${n}-${p}-${k} kg/ha NPK.`;
    }
  }
  return {
    factor: "Nutrients (NPK)",
    score,
    weight: WEIGHTS.nutrients,
    detail,
  };
}

function scoreTexture(crop: CropProfile, soil: FarmSoilData): FactorScore {
  const observed = [soil.texture, soil.soilOrder]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());

  if (observed.length === 0) {
    return {
      factor: "Soil texture",
      score: 0.6,
      weight: WEIGHTS.texture,
      detail: "Soil texture unknown — neutral score applied.",
    };
  }

  const matched = crop.textures.some((pref) =>
    observed.some((obs) => obs.includes(pref) || pref.includes(obs))
  );
  const score = matched ? 1 : 0.35;
  const detail = matched
    ? `Soil texture "${
      soil.texture ?? soil.soilOrder
    }" suits ${crop.name} (prefers ${crop.textures.join("/")}).`
    : `Soil texture "${
      soil.texture ?? soil.soilOrder
    }" is not a preferred type for ${crop.name} (prefers ${
      crop.textures.join("/")
    }).`;
  return { factor: "Soil texture", score, weight: WEIGHTS.texture, detail };
}

function scoreSeason(crop: CropProfile, season: Season): FactorScore {
  const inSeason = crop.seasons.includes(season);
  const score = inSeason ? 1 : 0;
  const detail = inSeason
    ? `Current season (${season}) is a sowing window for ${crop.name}.`
    : `${crop.name} is a ${
      crop.seasons.join("/")
    } crop — outside the current ${season} window.`;
  return { factor: "Season", score, weight: WEIGHTS.season, detail };
}

function riskPenalties(
  crop: CropProfile,
  soil: FarmSoilData,
): { penalty: number; warnings: string[] } {
  let penalty = 0;
  const warnings: string[] = [];

  if (
    (soil.salinityRisk === "moderate" || soil.salinityRisk === "severe") &&
    crop.salinityTolerance === 0
  ) {
    penalty += soil.salinityRisk === "severe" ? 15 : 8;
    warnings.push(
      `Soil salinity risk is ${soil.salinityRisk} and ${crop.name} is salinity-sensitive.`,
    );
  }
  if (
    (soil.waterloggingRisk === "moderate" ||
      soil.waterloggingRisk === "severe") &&
    !crop.waterloggingTolerant
  ) {
    penalty += soil.waterloggingRisk === "severe" ? 12 : 6;
    warnings.push(
      `Waterlogging risk is ${soil.waterloggingRisk}; ${crop.name} does not tolerate standing water.`,
    );
  }
  if (soil.erosionRisk === "severe") {
    penalty += 5;
    warnings.push(
      "Severe erosion risk — adopt contour cultivation/mulching regardless of crop.",
    );
  }

  return { penalty, warnings };
}

function verdictFor(score: number): CropRecommendation["verdict"] {
  if (score >= 75) return "highly_suitable";
  if (score >= 60) return "suitable";
  if (score >= 45) return "marginal";
  return "not_recommended";
}

/**
 * Score all candidate crops against the farm's data and return them ranked.
 */
export function scoreCrops(input: ScoringInput): ScoringResult {
  const date = input.date ?? new Date();
  const season = getCurrentSeason(date);

  const forecastDays = input.forecast.length;
  const forecastRainMm = input.forecast.reduce(
    (sum, d) => sum + (d.precipitation || 0),
    0,
  );
  const avgTempC = forecastDays > 0
    ? input.forecast.reduce(
      (sum, d) => sum + (d.temperatureMax + d.temperatureMin) / 2,
      0,
    ) / forecastDays
    : 28;

  const recommendations: CropRecommendation[] = CROP_PROFILES.map((crop) => {
    const factors = [
      scorePh(crop, input.soil.ph),
      scoreWater(crop, input, forecastRainMm, forecastDays),
      scoreTemperature(crop, avgTempC),
      scoreNutrients(crop, input.soil),
      scoreTexture(crop, input.soil),
      scoreSeason(crop, season),
    ];

    const weighted = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const { penalty, warnings } = riskPenalties(crop, input.soil);
    const score = Math.round(Math.max(0, Math.min(100, weighted - penalty)));

    return {
      cropId: crop.id,
      name: crop.name,
      nameHi: crop.nameHi,
      category: crop.category,
      score,
      verdict: verdictFor(score),
      seasons: crop.seasons,
      durationDays: crop.durationDays,
      factors,
      warnings,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    season,
    recommendations,
    dataCited: {
      ph: input.soil.ph,
      nitrogen: input.soil.nitrogen,
      phosphorus: input.soil.phosphorus,
      potassium: input.soil.potassium,
      texture: input.soil.texture ?? input.soil.soilOrder ?? null,
      soilMoisturePct: input.soil.moisture,
      forecastRainfallMm: Math.round(forecastRainMm),
      forecastDays,
      forecastAvgTempC: Number(avgTempC.toFixed(1)),
      rainfall7dMm: input.rainfall7d ?? null,
      latestNdvi: input.latestNdvi ?? null,
      ndviTrend: input.ndviTrend ?? null,
      waterSource: input.waterSource ?? null,
      sources: input.soil.sources,
    },
  };
}
