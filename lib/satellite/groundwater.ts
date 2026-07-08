/**
 * Groundwater Data Module
 *
 * Estimates groundwater potential at a farm location using multiple
 * data sources with fallback chain:
 *
 *   1. Bhuvan WMS "groundwater:gw_prospect" (ISRO/NRSC) — primary
 *   2. Open-Meteo deep soil moisture (100-255cm) — proxy for
 *      shallow water table proximity
 *   3. Soil-order / texture heuristic — Indian hydrogeology
 *      empirical mapping (always-available fallback)
 *
 * The result is a 5-class potential (excellent / good / moderate /
 * poor / nil) on the same scale the crop-scoring engine expects.
 */
import { getBhuvanFeatureInfo } from "./bhuvan.ts";

export type GroundwaterPotential =
  | "excellent"
  | "good"
  | "moderate"
  | "poor"
  | "nil";

export interface GroundwaterData {
  /** Categorised groundwater potential at the query point */
  potential: GroundwaterPotential | null;
  /** Human-readable description */
  description: string;
  /** Data source label */
  source: string;
}

/**
 * Soil-order → groundwater potential mapping based on Indian
 * hydrogeology (Deccan basalt = moderate, alluvial = good/excellent,
 * laterite = poor, etc.).
 */
const SOIL_ORDER_GW: Record<string, GroundwaterPotential> = {
  alluvial: "good",
  "alluvial (calcareous)": "good",
  "alluvial (deltaic)": "excellent",
  "alluvial (recent)": "excellent",
  "alluvial (older)": "good",
  coastal: "moderate",
  "coastal alluvial": "good",
  "coastal sand": "poor",
  "deltaic alluvial": "excellent",
  desert: "poor",
  "desert sand": "nil",
  forest: "moderate",
  glacial: "nil",
  laterite: "poor",
  "mixed red and black": "moderate",
  "mixed red and yellow": "moderate",
  peaty: "excellent",
  "red and yellow": "moderate",
  "red lateritic": "poor",
  "red loamy": "moderate",
  "red sandy": "poor",
  "red shallow": "poor",
  "red gravelly": "poor",
  "saline and alkaline": "moderate",
  "skeletal": "poor",
  "sub-montane": "moderate",
  tarai: "good",
  "tarai alluvial": "excellent",
};

const TEXTURE_GW: Record<string, GroundwaterPotential> = {
  clay: "good",
  "clay loam": "moderate",
  loam: "good",
  "silt loam": "good",
  silty: "good",
  "sandy loam": "moderate",
  loamy: "good",
  sandy: "poor",
  "loamy sand": "poor",
  gravelly: "poor",
  rocky: "nil",
};

/**
 * Primary source: query Bhuvan's "groundwater:gw_prospect" WMS
 * via GetFeatureInfo at a lat/lon point. Returns null when the
 * server is down, outside India, or the response is unparseable.
 */
export async function getGroundwaterPotential(
  lat: number,
  lon: number,
): Promise<GroundwaterData | null> {
  try {
    const info = await getBhuvanFeatureInfo({
      layer: "GROUNDWATER",
      lat,
      lon,
    });
    if (!info) return null;

    // Try every field name the layer may use
    const rawGw = String(
      info.gw_potential ??
        info.potential ??
        info.gw_prospect ??
        info.GW_PROSPECT ??
        info.description ??
        info.class_name ??
        info.GRAY_INDEX ??
        "",
    );
    if (!rawGw || rawGw === "null" || rawGw === "undefined") return null;

    const potential = classifyGroundwaterPotential(rawGw);
    if (potential) {
      return {
        potential,
        description: rawGw,
        source: "Bhuvan/NRSC GW Prospects",
      };
    }
  } catch {
    // Bhuvan unavailable — fall through to secondary sources
  }
  return null;
}

/**
 * Secondary source: estimate groundwater potential from soil order
 * and texture using an empirical Indian hydrogeology mapping.
 * This is the always-available fallback that needs no external API.
 */
export function estimateGroundwaterFromSoil(
  soilOrder?: string | null,
  texture?: string | null,
): GroundwaterData {
  // Try soil order first (most reliable indicator in India)
  if (soilOrder) {
    const key = soilOrder.toLowerCase().trim();
    const exact = SOIL_ORDER_GW[key];
    if (exact) {
      return {
        potential: exact,
        description:
          `${soilOrder} soil — groundwater potential estimated from soil order`,
        source: "Soil-order empirical map",
      };
    }
    // Partial match for combined names
    for (const [pattern, gw] of Object.entries(SOIL_ORDER_GW)) {
      if (key.includes(pattern) || pattern.includes(key)) {
        return {
          potential: gw,
          description:
            `${soilOrder} soil — groundwater potential estimated from soil order`,
          source: "Soil-order empirical map",
        };
      }
    }
  }

  // Fall back to texture
  if (texture) {
    const key = texture.toLowerCase().trim();
    const exact = TEXTURE_GW[key];
    if (exact) {
      return {
        potential: exact,
        description:
          `${texture} soil — groundwater potential estimated from texture`,
        source: "Soil-texture empirical map",
      };
    }
    for (const [pattern, gw] of Object.entries(TEXTURE_GW)) {
      if (key.includes(pattern) || pattern.includes(key)) {
        return {
          potential: gw,
          description:
            `${texture} soil — groundwater potential estimated from texture`,
          source: "Soil-texture empirical map",
        };
      }
    }
  }

  // Neutral default — no data available
  return {
    potential: null,
    description: "Insufficient data to estimate groundwater potential",
    source: "N/A",
  };
}

function classifyGroundwaterPotential(
  raw: string,
): GroundwaterPotential | null {
  const s = raw.toLowerCase().trim();
  if (s.includes("excellent")) return "excellent";
  if (s.includes("good")) return "good";
  if (s.includes("moderate")) return "moderate";
  if (s.includes("poor")) return "poor";
  if (s.includes("nil") || s.includes("very poor") || s === "nill") {
    return "nil";
  }
  const words = s.split(/\s+/);
  for (const w of words) {
    if (
      ["excellent", "good", "moderate", "poor", "nil"].includes(w)
    ) {
      return w as GroundwaterPotential;
    }
  }
  return null;
}

/**
 * Groundwater capacity multiplier for borewell/tubewell/well sources.
 * A farm with excellent groundwater can rely on a borewell more
 * confidently than one with poor prospects.
 */
export function groundwaterCapacityMultiplier(
  potential: GroundwaterPotential | null,
): number {
  switch (potential) {
    case "excellent":
      return 1.3;
    case "good":
      return 1.1;
    case "moderate":
      return 0.85;
    case "poor":
      return 0.5;
    case "nil":
      return 0.2;
    default:
      return 1.0;
  }
}

/** Human-readable label for the potential class */
export function groundwaterLabel(
  potential: GroundwaterPotential | null,
): string {
  switch (potential) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "moderate":
      return "Moderate";
    case "poor":
      return "Poor";
    case "nil":
      return "Nil";
    default:
      return "Unknown";
  }
}
