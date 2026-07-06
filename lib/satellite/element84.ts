/**
 * Element 84 Earth Search STAC API Client
 * Primary free source for Sentinel-2 and Landsat imagery
 * API: https://earth-search.aws.element84.com/v1
 * No authentication required!
 */

const EARTH_SEARCH_URL = "https://earth-search.aws.element84.com/v1";

interface STACFeature {
  id: string;
  type: "Feature";
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  bbox: number[];
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    "sat:relative_orbit"?: number;
    "s2:product_type"?: string;
    "landsat:wrs_path"?: number;
    "landsat:wrs_row"?: number;
    platform?: string;
    constellation?: string;
  };
  assets: Record<
    string,
    {
      href: string;
      type?: string;
      title?: string;
      roles?: string[];
    }
  >;
  links: Array<{ rel: string; href: string }>;
}

interface STACSearchResult {
  type: "FeatureCollection";
  features: STACFeature[];
  numberMatched?: number;
  numberReturned?: number;
  context?: {
    matched?: number;
    returned?: number;
    limit?: number;
  };
}

export interface SatelliteProduct {
  productId: string;
  source: "sentinel-2" | "landsat";
  acquisitionTime: Date;
  cloudCoverPct: number;
  boundingBox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  orbitNumber?: number;
  platform: string;
  assets: {
    red?: string;
    green?: string;
    blue?: string;
    nir?: string;
    scl?: string; // Scene Classification
    thumbnail?: string;
    visual?: string; // True color composite
  };
}

/**
 * Search Sentinel-2 L2A products via Element 84 Earth Search
 */
export async function searchSentinel2(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}): Promise<SatelliteProduct[]> {
  const { bbox, startDate, endDate, maxCloudCover = 30, limit = 50 } = params;

  const searchBody = {
    collections: ["sentinel-2-l2a"],
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
    query: {
      "eo:cloud_cover": { lte: maxCloudCover },
    },
    sortby: [{ field: "properties.datetime", direction: "desc" }],
  };

  const response = await fetch(`${EARTH_SEARCH_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Element 84 search failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }

  const result: STACSearchResult = await response.json();

  return result.features.map((f) => ({
    productId: f.id,
    source: "sentinel-2" as const,
    acquisitionTime: new Date(f.properties.datetime),
    cloudCoverPct: f.properties["eo:cloud_cover"] || 0,
    boundingBox: {
      minLon: f.bbox[0],
      minLat: f.bbox[1],
      maxLon: f.bbox[2],
      maxLat: f.bbox[3],
    },
    orbitNumber: f.properties["sat:relative_orbit"],
    platform: f.properties.platform || "sentinel-2",
    assets: {
      red: f.assets?.red?.href || f.assets?.B04?.href,
      green: f.assets?.green?.href || f.assets?.B03?.href,
      blue: f.assets?.blue?.href || f.assets?.B02?.href,
      nir: f.assets?.nir?.href || f.assets?.B08?.href,
      scl: f.assets?.scl?.href || f.assets?.SCL?.href,
      thumbnail: f.assets?.thumbnail?.href,
      visual: f.assets?.visual?.href,
    },
  }));
}

/**
 * Search Landsat Collection 2 via Element 84 Earth Search
 */
export async function searchLandsat(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}): Promise<SatelliteProduct[]> {
  const { bbox, startDate, endDate, maxCloudCover = 30, limit = 50 } = params;

  const searchBody = {
    collections: ["landsat-c2-l2"],
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
    query: {
      "eo:cloud_cover": { lte: maxCloudCover },
    },
    sortby: [{ field: "properties.datetime", direction: "desc" }],
  };

  const response = await fetch(`${EARTH_SEARCH_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    throw new Error(`Element 84 Landsat search failed: ${response.status}`);
  }

  const result: STACSearchResult = await response.json();

  return result.features.map((f) => ({
    productId: f.id,
    source: "landsat" as const,
    acquisitionTime: new Date(f.properties.datetime),
    cloudCoverPct: f.properties["eo:cloud_cover"] || 0,
    boundingBox: {
      minLon: f.bbox[0],
      minLat: f.bbox[1],
      maxLon: f.bbox[2],
      maxLat: f.bbox[3],
    },
    orbitNumber: f.properties["landsat:wrs_path"],
    platform: f.properties.platform || "landsat-8",
    assets: {
      red: f.assets?.red?.href,
      green: f.assets?.green?.href,
      blue: f.assets?.blue?.href,
      nir: f.assets?.nir08?.href,
      thumbnail: f.assets?.thumbnail?.href,
    },
  }));
}

/**
 * Get COG tile URL for visualization (no processing needed)
 */
export function getCOGTileUrl(
  assetUrl: string,
  params?: {
    rescale?: string;
    colormap?: string;
  },
): string {
  // Use titiler or similar COG server
  const tilerUrl = "https://titiler.xyz/cog/tiles/{z}/{x}/{y}";
  const url = new URL(
    tilerUrl.replace("{z}/{x}/{y}", "WebMercatorQuad/{z}/{x}/{y}"),
  );
  url.searchParams.set("url", assetUrl);
  if (params?.rescale) url.searchParams.set("rescale", params.rescale);
  if (params?.colormap) url.searchParams.set("colormap_name", params.colormap);
  return url.toString();
}

/**
 * Get STAC item statistics (for NDVI calculation)
 */
export async function getItemStatistics(
  itemUrl: string,
  _geometry: { type: string; coordinates: number[][][] },
): Promise<{
  ndvi?: { mean: number; std: number };
  cloudCover?: number;
}> {
  // Element 84 provides direct COG access
  // For statistics, we'd use a COG statistics endpoint
  // For now, return basic info from the STAC item
  try {
    const response = await fetch(itemUrl);
    if (!response.ok) return {};

    const item = await response.json();
    return {
      cloudCover: item.properties?.["eo:cloud_cover"],
    };
  } catch {
    return {};
  }
}
