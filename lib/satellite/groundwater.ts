/**
 * Groundwater Data Module
 *
 * Fetches groundwater depth-to-water-level data from Bhuvan/CGWB WMS
 * and feeds it into crop recommendation scoring as a scored input.
 *
 * NOTE (2026-07-08): the previously-used layer "groundwater:gw_prospect"
 * does not exist on Bhuvan's server -- confirmed via direct WMS query,
 * ServiceException code=LayerNotDefined for every location tested. This
 * module now targets "cgwb:cgwb_depth" (CGWB depth-to-water-level, a real
 * layer per GetCapabilities) as a best guess, UNVERIFIED LIVE because
 * Bhuvan's WMS backend (bhuvan-vec1/vec2) was down when this was written.
 * The property field name and whether it needs a pre/post-monsoon or year
 * filter are unconfirmed -- getDepthMeters() below tries several likely
 * field names defensively and falls back to a text-classification path
 * (classifyGroundwaterPotential) in case the response is categorical
 * instead of numeric. Verify against a real response and adjust field
 * names / add CQL_FILTER params as needed once Bhuvan responds again.
 *
 * Depth-to-water-level is converted into the same excellent/good/
 * moderate/poor/nil scale the scoring engine expects, using standard
 * CGWB-style bands (shallower water table = more reliable borewell
 * extraction = better score).
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
  /** Human description returned by the WMS */
  description: string;
  /** Data source label */
  source: string;
}

/**
 * Query Bhuvan/CGWB groundwater WMS for a lat/lon location.
 * Returns null when the point falls outside India, the WMS is
 * unreachable, or the response has no usable groundwater field.
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

    const depthMeters = getDepthMeters(info);
    if (depthMeters !== null) {
      const potential = classifyDepthToWaterLevel(depthMeters);
      return {
        potential,
        description: `${depthMeters}m below ground level`,
        source: "CGWB/Bhuvan Depth to Water Level",
      };
    }

    // Fall back to a text classification, in case the layer/response
    // turns out to be categorical rather than a numeric depth.
    const rawGw = String(
      info.gw_potential ??
        info.potential ??
        info.gw_prospect ??
        info.GW_PROSPECT ??
        info.description ??
        info.class_name ??
        "",
    );
    if (!rawGw) return null;

    const potential = classifyGroundwaterPotential(rawGw);
    return {
      potential,
      description: rawGw,
      source: "Bhuvan/NRSC GW Prospects",
    };
  } catch {
    return null;
  }
}

/**
 * Extract a numeric depth-to-water-level (metres bgl) from a
 * GetFeatureInfo properties object, trying several plausible field
 * names since the exact schema for cgwb:cgwb_depth isn't confirmed yet.
 */
function getDepthMeters(info: Record<string, unknown>): number | null {
  const candidates = [
    info.depth,
    info.DEPTH,
    info.dtwl,
    info.DTWL,
    info.water_level,
    info.WATER_LEVEL,
    info.gwl,
    info.GWL,
    info.pre_mon,
    info.PRE_MON,
    info.post_mon,
    info.POST_MON,
    info.value,
    info.VALUE,
    info.GRAY_INDEX,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const n = typeof c === "number" ? c : parseFloat(String(c));
    if (!isNaN(n) && n >= 0 && n < 200) return n;
  }
  return null;
}

/**
 * Standard CGWB-style depth-to-water-level bands. Shallower = more
 * reliable for borewell/tubewell extraction.
 */
function classifyDepthToWaterLevel(depthMeters: number): GroundwaterPotential {
  if (depthMeters <= 5) return "excellent";
  if (depthMeters <= 10) return "good";
  if (depthMeters <= 20) return "moderate";
  if (depthMeters <= 40) return "poor";
  return "nil";
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
  // If the raw text is unrecognisable, still try to extract a single word
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
