/**
 * Soil Data Module
 * Provides consistent soil data for farms using multiple sources:
 * - SoilGrids (ISRIC) - 250m global soil data
 * - NBSS&LUP / Bhuvan - Indian soil classification
 * - Open-Meteo - Real-time soil moisture/temperature
 * - UPAg - Government agricultural statistics
 */

import { getSoilData as getOpenMeteoSoil } from "$lib/satellite/weather.ts";
import { getFarmSoilProfile } from "$lib/satellite/soilgrids.ts";
import {
  getBhuvanSoilMoisture,
  getIndianSoilProfile,
  getSoilHealthRecommendations,
} from "$lib/satellite/bhuvan_soil.ts";

export interface FarmSoilData {
  moisture: number;
  temperature: number;
  ph: number;
  nitrogen: "Low" | "Moderate" | "Adequate" | "High";
  phosphorus: "Low" | "Moderate" | "Adequate" | "High";
  potassium: "Low" | "Moderate" | "Adequate" | "High";
  texture?: string;
  fertility?: "low" | "medium" | "high";
  organicCarbon?: number;
  // Extended data from Indian sources
  soilOrder?: string;
  drainage?: string;
  electricalConductivity?: number;
  erosionRisk?: "none" | "slight" | "moderate" | "severe";
  salinityRisk?: "none" | "slight" | "moderate" | "severe";
  waterloggingRisk?: "none" | "slight" | "moderate" | "severe";
  // Recommendations
  fertilizerRecommendation?: { n: number; p: number; k: number };
  amendments?: string[];
  suitableCrops?: string[];
  // Data sources used
  sources: string[];
}

// Simple hash function for deterministic pseudo-random
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Seeded random number generator
function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const rand = x - Math.floor(x);
  return min + rand * (max - min);
}

/**
 * Get comprehensive soil data for a farm from multiple sources
 * Priority: Bhuvan/NBSS (India) > SoilGrids > Open-Meteo > Deterministic fallback
 */
export async function getFarmSoilData(params: {
  farmId: string;
  lat: number;
  lon: number;
  soilType?: string;
  healthScore?: number;
  state?: string;
  district?: string;
}): Promise<FarmSoilData> {
  const { farmId, lat, lon, soilType, healthScore = 60, state, district } =
    params;
  const sources: string[] = [];

  // Generate deterministic base values from farm ID
  const seed = hashCode(farmId);
  let moisture = Math.round(seededRandom(seed, 35, 55));
  let temperature = Math.round(seededRandom(seed + 1, 20, 28));
  let ph = Number(seededRandom(seed + 2, 6.0, 7.5).toFixed(1));
  let texture: string | undefined;
  let fertility: "low" | "medium" | "high" | undefined;
  let organicCarbon: number | undefined;
  let soilOrder: string | undefined;
  let drainage: string | undefined;
  let electricalConductivity: number | undefined;
  let erosionRisk: "none" | "slight" | "moderate" | "severe" | undefined;
  let salinityRisk: "none" | "slight" | "moderate" | "severe" | undefined;
  let waterloggingRisk: "none" | "slight" | "moderate" | "severe" | undefined;
  let fertilizerRecommendation: { n: number; p: number; k: number } | undefined;
  let amendments: string[] | undefined;
  let suitableCrops: string[] | undefined;
  let nitrogen: "Low" | "Moderate" | "Adequate" | "High" | undefined;
  let phosphorus: "Low" | "Moderate" | "Adequate" | "High" | undefined;
  let potassium: "Low" | "Moderate" | "Adequate" | "High" | undefined;

  // Check if location is in India (approx bounds)
  const isIndia = lat >= 6 && lat <= 37 && lon >= 68 && lon <= 98;

  // 1. Try Indian sources first (Bhuvan/NBSS) for Indian locations
  if (isIndia) {
    try {
      const indianProfile = await getIndianSoilProfile({
        lat,
        lon,
        state,
        district,
      });

      if (indianProfile) {
        ph = indianProfile.ph;
        organicCarbon = indianProfile.organicCarbon;
        texture = indianProfile.texture;
        soilOrder = indianProfile.soilOrder;
        drainage = indianProfile.drainage;
        electricalConductivity = indianProfile.electricalConductivity;
        erosionRisk = indianProfile.erosionRisk;
        salinityRisk = indianProfile.salinityRisk;
        waterloggingRisk = indianProfile.waterloggingRisk;

        // Map Indian nutrient status
        nitrogen = mapNutrientStatus(indianProfile.nitrogen);
        phosphorus = mapNutrientStatus(indianProfile.phosphorus);
        potassium = mapNutrientStatus(indianProfile.potassium);

        // Get recommendations
        const recommendations = getSoilHealthRecommendations(indianProfile);
        fertilizerRecommendation = recommendations.fertilizerRecommendation;
        amendments = recommendations.amendments;
        suitableCrops = recommendations.suitableCrops;

        // Determine fertility from nutrient status
        fertility = determineFertilityFromNutrients(
          indianProfile.nitrogen,
          indianProfile.phosphorus,
          indianProfile.potassium,
        );

        sources.push("NBSS&LUP/Bhuvan");
      }
    } catch {
      // Fall through to SoilGrids
    }

    // Try Bhuvan soil moisture
    try {
      const bhuvanMoisture = await getBhuvanSoilMoisture(lat, lon);
      if (bhuvanMoisture) {
        moisture = Math.round(bhuvanMoisture.moisture);
        sources.push("Bhuvan Soil Moisture");
      }
    } catch {
      // Continue
    }
  }

  // 2. Try SoilGrids for global data (or if Indian sources failed)
  if (sources.length === 0 || !fertility) {
    try {
      const soilGridsProfile = await getFarmSoilProfile(lat, lon);
      if (soilGridsProfile.ph > 0) {
        if (!sources.includes("NBSS&LUP/Bhuvan")) {
          ph = Number(soilGridsProfile.ph.toFixed(1));
          organicCarbon = soilGridsProfile.organicCarbon;
        }
        texture = texture || soilGridsProfile.texture;
        fertility = fertility || soilGridsProfile.fertility;
        sources.push("SoilGrids (ISRIC)");
      }
    } catch {
      // Continue
    }
  }

  // 3. Try Open-Meteo for real-time moisture/temperature
  try {
    const today = new Date().toISOString().split("T")[0];
    const realTimeSoil = await getOpenMeteoSoil({
      lat,
      lon,
      startDate: today,
      endDate: today,
    });
    const latest = realTimeSoil[realTimeSoil.length - 1];
    if (latest) {
      if (latest.soilMoisture > 0) {
        // Volumetric m³/m³ → percent
        moisture = Math.round(latest.soilMoisture * 100);
      }
      if (latest.soilTemperature > 0) {
        temperature = Math.round(latest.soilTemperature);
      }
      sources.push("Open-Meteo");
    }
  } catch {
    // Use base values
  }

  // 4. Fallback: Determine NPK status if not set
  if (!nitrogen) {
    nitrogen = determineNutrientStatus(healthScore, soilType, "N", seed + 3);
  }
  if (!phosphorus) {
    phosphorus = determineNutrientStatus(healthScore, soilType, "P", seed + 4);
  }
  if (!potassium) {
    potassium = determineNutrientStatus(healthScore, soilType, "K", seed + 5);
  }

  if (sources.length === 0) {
    sources.push("Estimated");
  }

  return {
    moisture,
    temperature,
    ph,
    nitrogen,
    phosphorus,
    potassium,
    texture,
    fertility,
    organicCarbon,
    soilOrder,
    drainage,
    electricalConductivity,
    erosionRisk,
    salinityRisk,
    waterloggingRisk,
    fertilizerRecommendation,
    amendments,
    suitableCrops,
    sources,
  };
}

/**
 * Map Indian nutrient status to our format
 */
function mapNutrientStatus(
  status: "Low" | "Medium" | "High",
): "Low" | "Moderate" | "Adequate" | "High" {
  switch (status) {
    case "Low":
      return "Low";
    case "Medium":
      return "Moderate";
    case "High":
      return "Adequate";
    default:
      return "Moderate";
  }
}

/**
 * Determine fertility level from NPK status
 */
function determineFertilityFromNutrients(
  n: "Low" | "Medium" | "High",
  p: "Low" | "Medium" | "High",
  k: "Low" | "Medium" | "High",
): "low" | "medium" | "high" {
  const scores = { Low: 0, Medium: 1, High: 2 };
  const total = scores[n] + scores[p] + scores[k];
  if (total >= 5) return "high";
  if (total >= 2) return "medium";
  return "low";
}

function determineNutrientStatus(
  healthScore: number,
  soilType: string | undefined,
  nutrient: "N" | "P" | "K",
  seed: number,
): "Low" | "Moderate" | "Adequate" | "High" {
  // Base probability influenced by health score
  const rand = seededRandom(seed, 0, 100);

  // Soil type adjustments
  let adjustment = 0;
  if (soilType) {
    switch (soilType.toLowerCase()) {
      case "alluvial":
        adjustment = nutrient === "N" ? 10 : 5;
        break;
      case "black":
        adjustment = nutrient === "K" ? 15 : 5;
        break;
      case "red":
        adjustment = -10;
        break;
      case "laterite":
        adjustment = nutrient === "P" ? -15 : -5;
        break;
      case "clay":
        adjustment = 5;
        break;
      case "sandy":
        adjustment = -15;
        break;
    }
  }

  const score = healthScore + adjustment + rand * 0.3;

  if (score >= 75) return "Adequate";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Low";
  return "Low";
}

/**
 * Get cached or calculated soil score for Agri Score
 */
export function getSoilScore(params: {
  farmId: string;
  soilType?: string;
  waterSource?: string;
}): number {
  const { farmId, soilType, waterSource } = params;
  const seed = hashCode(farmId);

  // Base score from soil type
  let baseScore = 65;
  if (soilType) {
    switch (soilType.toLowerCase()) {
      case "alluvial":
        baseScore = 85;
        break;
      case "black":
        baseScore = 80;
        break;
      case "red":
        baseScore = 70;
        break;
      case "laterite":
        baseScore = 60;
        break;
      case "clay":
        baseScore = 75;
        break;
      case "sandy":
        baseScore = 55;
        break;
      case "loamy":
        baseScore = 82;
        break;
    }
  }

  // Adjust based on water source
  if (waterSource) {
    switch (waterSource.toLowerCase()) {
      case "canal":
        baseScore += 5;
        break;
      case "drip":
        baseScore += 8;
        break;
      case "borewell":
        baseScore += 3;
        break;
      case "rainfed":
        baseScore -= 5;
        break;
    }
  }

  // Small deterministic variation
  const variation = Math.round(seededRandom(seed + 10, -5, 5));

  return Math.min(100, Math.max(0, baseScore + variation));
}
