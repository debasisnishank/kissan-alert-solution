/**
 * SoilGrids Integration (ISRIC World Soil Information)
 * https://soilgrids.org/
 *
 * Free global soil data at 250m resolution
 * Provides: pH, SOC, Nitrogen, Clay, Sand, Silt, CEC, etc.
 */

interface SoilGridsParams {
  lat: number;
  lon: number;
  properties?: SoilProperty[];
  depths?: SoilDepth[];
}

type SoilProperty =
  | "bdod" // Bulk density
  | "cec" // Cation exchange capacity
  | "cfvo" // Coarse fragments
  | "clay" // Clay content
  | "nitrogen" // Total nitrogen
  | "ocd" // Organic carbon density
  | "ocs" // Organic carbon stocks
  | "phh2o" // pH in H2O
  | "sand" // Sand content
  | "silt" // Silt content
  | "soc" // Soil organic carbon
  | "wv0010" // Water content at pF 1.0
  | "wv0033" // Water content at pF 2.0
  | "wv1500"; // Water content at pF 4.2

type SoilDepth =
  | "0-5cm"
  | "5-15cm"
  | "15-30cm"
  | "30-60cm"
  | "60-100cm"
  | "100-200cm";

interface SoilData {
  property: SoilProperty;
  depth: SoilDepth;
  value: number;
  unit: string;
  uncertainty: {
    q0_05: number;
    q0_5: number;
    q0_95: number;
    mean: number;
  };
}

interface SoilGridsResult {
  lat: number;
  lon: number;
  properties: SoilData[];
  source: "soilgrids";
  timestamp: string;
}

const SOILGRIDS_API = "https://rest.isric.org/soilgrids/v2.0";

// Property units mapping
const PROPERTY_UNITS: Record<SoilProperty, { unit: string; factor: number }> = {
  bdod: { unit: "kg/dm³", factor: 0.01 },
  cec: { unit: "cmol(c)/kg", factor: 0.1 },
  cfvo: { unit: "cm³/100cm³", factor: 0.1 },
  clay: { unit: "g/100g", factor: 0.1 },
  nitrogen: { unit: "g/kg", factor: 0.01 },
  ocd: { unit: "kg/m³", factor: 0.1 },
  ocs: { unit: "t/ha", factor: 0.1 },
  phh2o: { unit: "pH", factor: 0.1 },
  sand: { unit: "g/100g", factor: 0.1 },
  silt: { unit: "g/100g", factor: 0.1 },
  soc: { unit: "g/kg", factor: 0.1 },
  wv0010: { unit: "cm³/100cm³", factor: 0.001 },
  wv0033: { unit: "cm³/100cm³", factor: 0.001 },
  wv1500: { unit: "cm³/100cm³", factor: 0.001 },
};

/**
 * Get soil properties for a location from SoilGrids
 */
export async function getSoilGridsData(
  params: SoilGridsParams,
): Promise<SoilGridsResult> {
  const {
    lat,
    lon,
    properties = ["phh2o", "nitrogen", "soc", "clay", "sand", "cec"],
    depths = ["0-5cm", "5-15cm", "15-30cm"],
  } = params;

  const propertyStr = properties.join(",");
  const depthStr = depths.join(",");

  const url =
    `${SOILGRIDS_API}/properties/query?lon=${lon}&lat=${lat}&property=${propertyStr}&depth=${depthStr}&value=mean&value=Q0.05&value=Q0.5&value=Q0.95`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`SoilGrids API error: ${response.status}`);
    }

    const data = await response.json();
    const soilProperties: SoilData[] = [];

    // Parse response
    if (data.properties?.layers) {
      for (const layer of data.properties.layers) {
        const property = layer.name as SoilProperty;
        const unitInfo = PROPERTY_UNITS[property] || {
          unit: "unknown",
          factor: 1,
        };

        for (const depth of layer.depths || []) {
          const depthLabel = depth.label as SoilDepth;
          const values = depth.values || {};

          soilProperties.push({
            property,
            depth: depthLabel,
            value: (values.mean || 0) * unitInfo.factor,
            unit: unitInfo.unit,
            uncertainty: {
              q0_05: (values["Q0.05"] || 0) * unitInfo.factor,
              q0_5: (values["Q0.5"] || 0) * unitInfo.factor,
              q0_95: (values["Q0.95"] || 0) * unitInfo.factor,
              mean: (values.mean || 0) * unitInfo.factor,
            },
          });
        }
      }
    }

    return {
      lat,
      lon,
      properties: soilProperties,
      source: "soilgrids",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[SoilGrids] API error:", error);
    return {
      lat,
      lon,
      properties: [],
      source: "soilgrids",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get aggregated soil profile for farming
 */
export async function getFarmSoilProfile(
  lat: number,
  lon: number,
): Promise<{
  ph: number;
  nitrogen: number; // g/kg
  organicCarbon: number; // g/kg
  clay: number; // %
  sand: number; // %
  silt: number; // %
  cec: number; // cmol/kg
  texture: string;
  fertility: "low" | "medium" | "high";
  source: string;
}> {
  const result = await getSoilGridsData({
    lat,
    lon,
    properties: ["phh2o", "nitrogen", "soc", "clay", "sand", "silt", "cec"],
    depths: ["0-5cm", "5-15cm", "15-30cm"],
  });

  // Average values across top 30cm (agricultural layer)
  const getValue = (prop: SoilProperty): number => {
    const values = result.properties
      .filter((p) => p.property === prop)
      .map((p) => p.value);
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  };

  const ph = getValue("phh2o");
  const nitrogen = getValue("nitrogen");
  const organicCarbon = getValue("soc");
  const clay = getValue("clay");
  const sand = getValue("sand");
  const silt = getValue("silt");
  const cec = getValue("cec");

  // Determine texture class
  const texture = getSoilTexture(sand, silt, clay);

  // Determine fertility level
  const fertility = determineFertility(organicCarbon, nitrogen, cec, ph);

  return {
    ph,
    nitrogen,
    organicCarbon,
    clay,
    sand,
    silt,
    cec,
    texture,
    fertility,
    source: "SoilGrids (ISRIC)",
  };
}

/**
 * Determine soil texture class from particle sizes
 */
function getSoilTexture(sand: number, silt: number, clay: number): string {
  if (clay >= 40) {
    if (silt >= 40) return "Silty Clay";
    if (sand >= 45) return "Sandy Clay";
    return "Clay";
  }
  if (clay >= 27 && clay < 40) {
    if (sand >= 20 && sand < 45) return "Clay Loam";
    if (sand < 20) return "Silty Clay Loam";
    return "Sandy Clay Loam";
  }
  if (silt >= 50) {
    if (clay >= 12) return "Silty Loam";
    return "Silt";
  }
  if (sand >= 85) return "Sand";
  if (sand >= 70) return "Loamy Sand";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand < 52) {
    return "Loam";
  }
  return "Sandy Loam";
}

/**
 * Determine soil fertility level
 */
function determineFertility(
  soc: number,
  nitrogen: number,
  cec: number,
  ph: number,
): "low" | "medium" | "high" {
  let score = 0;

  // Organic carbon scoring (ideal: 2-4%)
  if (soc >= 20) score += 3;
  else if (soc >= 10) score += 2;
  else if (soc >= 5) score += 1;

  // Nitrogen scoring (ideal: 0.1-0.2%)
  if (nitrogen >= 0.15) score += 3;
  else if (nitrogen >= 0.1) score += 2;
  else if (nitrogen >= 0.05) score += 1;

  // CEC scoring (ideal: >25 cmol/kg)
  if (cec >= 25) score += 3;
  else if (cec >= 15) score += 2;
  else if (cec >= 10) score += 1;

  // pH scoring (ideal: 6.0-7.5)
  if (ph >= 6 && ph <= 7.5) score += 3;
  else if (ph >= 5.5 && ph <= 8) score += 2;
  else score += 1;

  if (score >= 9) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/**
 * Get SoilGrids WCS (Web Coverage Service) URL for raster data
 */
export function getSoilGridsWcsUrl(params: {
  property: SoilProperty;
  depth: SoilDepth;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}): string {
  const { property, depth, bbox } = params;
  const depthCode = depth.replace("cm", "").replace("-", "_");

  return `${SOILGRIDS_API}/coverage/${property}_${depthCode}_mean?format=image/tiff&subset=lat(${bbox.minLat},${bbox.maxLat})&subset=lon(${bbox.minLon},${bbox.maxLon})`;
}

export type {
  SoilData,
  SoilDepth,
  SoilGridsParams,
  SoilGridsResult,
  SoilProperty,
};
