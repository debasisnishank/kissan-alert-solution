/**
 * Unified Satellite Data Client with Fallback Chain
 * Priority order:
 * 1. Element 84 Earth Search (free, no auth)
 * 2. NASA GIBS (free, no auth)
 * 3. Microsoft Planetary Computer (free, no auth)
 * 4. Copernicus CDSE (free, requires registration)
 */

import {
  type SatelliteProduct,
  searchLandsat as e84SearchLandsat,
  searchSentinel2 as e84SearchSentinel2,
} from "./element84.ts";
import {
  getNDVITileUrl,
  searchLandsat as pcSearchLandsat,
  searchSentinel2 as pcSearchSentinel2,
} from "./planetary_computer.ts";
import { getLeafletTileUrl, getWMSImageUrl, GIBS_LAYERS } from "./nasa_gibs.ts";

export interface SearchParams {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}

export interface SatelliteSearchResult {
  products: SatelliteProduct[];
  source: "element84" | "planetary_computer" | "copernicus";
  error?: string;
}

/**
 * Search for Sentinel-2 imagery with automatic fallback
 */
export async function searchSentinel2WithFallback(
  params: SearchParams,
): Promise<SatelliteSearchResult> {
  // Try Element 84 first (fastest, most reliable)
  try {
    console.log("[SATELLITE] Trying Element 84 Earth Search...");
    const products = await e84SearchSentinel2(params);
    if (products.length > 0) {
      console.log(`[SATELLITE] Element 84: Found ${products.length} products`);
      return { products, source: "element84" };
    }
  } catch (error) {
    console.warn("[SATELLITE] Element 84 failed:", error);
  }

  // Try Microsoft Planetary Computer
  try {
    console.log("[SATELLITE] Trying Microsoft Planetary Computer...");
    const pcProducts = await pcSearchSentinel2(params);
    if (pcProducts.length > 0) {
      console.log(
        `[SATELLITE] Planetary Computer: Found ${pcProducts.length} products`,
      );
      // Convert PC products to standard format
      const products: SatelliteProduct[] = pcProducts.map((p) => ({
        productId: p.productId,
        source: "sentinel-2" as const,
        acquisitionTime: p.acquisitionTime,
        cloudCoverPct: p.cloudCoverPct,
        boundingBox: p.boundingBox,
        platform: p.platform,
        assets: p.assets,
      }));
      return { products, source: "planetary_computer" };
    }
  } catch (error) {
    console.warn("[SATELLITE] Planetary Computer failed:", error);
  }

  // Return empty with error
  return {
    products: [],
    source: "element84",
    error: "All satellite data sources failed",
  };
}

/**
 * Search for Landsat imagery with automatic fallback
 */
export async function searchLandsatWithFallback(
  params: SearchParams,
): Promise<SatelliteSearchResult> {
  // Try Element 84 first
  try {
    console.log("[SATELLITE] Trying Element 84 for Landsat...");
    const products = await e84SearchLandsat(params);
    if (products.length > 0) {
      console.log(
        `[SATELLITE] Element 84 Landsat: Found ${products.length} products`,
      );
      return { products, source: "element84" };
    }
  } catch (error) {
    console.warn("[SATELLITE] Element 84 Landsat failed:", error);
  }

  // Try Planetary Computer
  try {
    console.log("[SATELLITE] Trying Planetary Computer for Landsat...");
    const pcProducts = await pcSearchLandsat(params);
    if (pcProducts.length > 0) {
      const products: SatelliteProduct[] = pcProducts.map((p) => ({
        productId: p.productId,
        source: "landsat" as const,
        acquisitionTime: p.acquisitionTime,
        cloudCoverPct: p.cloudCoverPct,
        boundingBox: p.boundingBox,
        platform: p.platform,
        assets: p.assets,
      }));
      return { products, source: "planetary_computer" };
    }
  } catch (error) {
    console.warn("[SATELLITE] Planetary Computer Landsat failed:", error);
  }

  return {
    products: [],
    source: "element84",
    error: "All Landsat sources failed",
  };
}

/**
 * Search all available satellite sources
 */
export async function searchAllSatelliteSources(
  params: SearchParams,
): Promise<{
  sentinel2: SatelliteSearchResult;
  landsat: SatelliteSearchResult;
}> {
  const [sentinel2, landsat] = await Promise.all([
    searchSentinel2WithFallback(params),
    searchLandsatWithFallback(params),
  ]);

  return { sentinel2, landsat };
}

/**
 * Get tile layer URLs for map visualization
 */
export function getMapLayers(params: {
  date: string;
  bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  itemId?: string;
}): {
  ndvi: string;
  trueColor: string;
  precipitation: string;
  soilMoisture: string;
} {
  const { date, _bbox, itemId } = params;

  // Use NASA GIBS for MODIS-based layers (global coverage)
  const ndviUrl = itemId
    ? getNDVITileUrl(itemId)
    : getLeafletTileUrl(GIBS_LAYERS.MODIS_NDVI, date);

  const trueColorUrl = getLeafletTileUrl(
    GIBS_LAYERS.MODIS_TRUE_COLOR,
    date,
  );

  const precipUrl = getLeafletTileUrl(
    GIBS_LAYERS.GPM_PRECIPITATION_DAILY,
    date,
  );

  const soilUrl = getLeafletTileUrl(
    GIBS_LAYERS.SMAP_SOIL_MOISTURE,
    date,
  );

  return {
    ndvi: ndviUrl,
    trueColor: trueColorUrl,
    precipitation: precipUrl,
    soilMoisture: soilUrl,
  };
}

/**
 * Get static image for a bbox (for thumbnails/reports)
 */
export function getStaticMapImage(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  date: string;
  layer: "ndvi" | "trueColor" | "precipitation";
  width?: number;
  height?: number;
}): string {
  const { bbox, date, layer, width = 512, height = 512 } = params;

  const layerMap = {
    ndvi: GIBS_LAYERS.MODIS_NDVI,
    trueColor: GIBS_LAYERS.MODIS_TRUE_COLOR,
    precipitation: GIBS_LAYERS.GPM_PRECIPITATION_DAILY,
  };

  return getWMSImageUrl({
    layer: layerMap[layer],
    bbox,
    date,
    width,
    height,
  });
}

// Re-export types
export type { SatelliteProduct } from "./element84.ts";
