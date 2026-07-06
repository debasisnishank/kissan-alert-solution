/**
 * Microsoft Planetary Computer STAC API Client
 * Free access to Sentinel-2, Landsat, and other datasets
 * https://planetarycomputer.microsoft.com/
 * No authentication required for STAC search!
 */

const PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1";

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
    "s2:mgrs_tile"?: string;
    platform?: string;
    "landsat:wrs_path"?: number;
    "landsat:wrs_row"?: number;
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
  context?: {
    matched?: number;
    returned?: number;
    limit?: number;
  };
}

export interface PCProduct {
  productId: string;
  collection: string;
  acquisitionTime: Date;
  cloudCoverPct: number;
  boundingBox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  platform: string;
  assets: {
    red?: string;
    green?: string;
    blue?: string;
    nir?: string;
    scl?: string;
    visual?: string;
    thumbnail?: string;
  };
  signedAssets?: Record<string, string>;
}

/**
 * Sign asset URLs for access (required for actual data download)
 * Note: For tile visualization, signed URLs may not be needed
 */
async function _signAssetUrl(assetUrl: string): Promise<string> {
  try {
    // Planetary Computer provides a signing endpoint
    const response = await fetch(
      `https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=${
        encodeURIComponent(assetUrl)
      }`,
    );
    if (!response.ok) return assetUrl;

    const data = await response.json();
    return data.href || assetUrl;
  } catch {
    return assetUrl;
  }
}

/**
 * Search Sentinel-2 L2A on Planetary Computer
 */
export async function searchSentinel2(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}): Promise<PCProduct[]> {
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

  const response = await fetch(`${PC_STAC_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    throw new Error(`Planetary Computer search failed: ${response.status}`);
  }

  const result: STACSearchResult = await response.json();

  return result.features.map((f) => ({
    productId: f.id,
    collection: "sentinel-2-l2a",
    acquisitionTime: new Date(f.properties.datetime),
    cloudCoverPct: f.properties["eo:cloud_cover"] || 0,
    boundingBox: {
      minLon: f.bbox[0],
      minLat: f.bbox[1],
      maxLon: f.bbox[2],
      maxLat: f.bbox[3],
    },
    platform: f.properties.platform || "Sentinel-2",
    assets: {
      red: f.assets?.B04?.href,
      green: f.assets?.B03?.href,
      blue: f.assets?.B02?.href,
      nir: f.assets?.B08?.href,
      scl: f.assets?.SCL?.href,
      visual: f.assets?.visual?.href,
      thumbnail: f.assets?.thumbnail?.href || f.assets?.rendered_preview?.href,
    },
  }));
}

/**
 * Search Landsat Collection 2 on Planetary Computer
 */
export async function searchLandsat(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}): Promise<PCProduct[]> {
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

  const response = await fetch(`${PC_STAC_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    throw new Error(
      `Planetary Computer Landsat search failed: ${response.status}`,
    );
  }

  const result: STACSearchResult = await response.json();

  return result.features.map((f) => ({
    productId: f.id,
    collection: "landsat-c2-l2",
    acquisitionTime: new Date(f.properties.datetime),
    cloudCoverPct: f.properties["eo:cloud_cover"] || 0,
    boundingBox: {
      minLon: f.bbox[0],
      minLat: f.bbox[1],
      maxLon: f.bbox[2],
      maxLat: f.bbox[3],
    },
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
 * Get NAIP (high-res aerial imagery) for US locations
 */
export async function searchNAIP(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate?: string;
  limit?: number;
}): Promise<PCProduct[]> {
  const { bbox, startDate, limit = 10 } = params;

  const searchBody: Record<string, unknown> = {
    collections: ["naip"],
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    limit,
  };

  if (startDate) {
    searchBody.datetime = `${startDate}T00:00:00Z/..`;
  }

  const response = await fetch(`${PC_STAC_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) return [];

  const result: STACSearchResult = await response.json();

  return result.features.map((f) => ({
    productId: f.id,
    collection: "naip",
    acquisitionTime: new Date(f.properties.datetime),
    cloudCoverPct: 0,
    boundingBox: {
      minLon: f.bbox[0],
      minLat: f.bbox[1],
      maxLon: f.bbox[2],
      maxLat: f.bbox[3],
    },
    platform: "aerial",
    assets: {
      visual: f.assets?.image?.href,
    },
  }));
}

/**
 * Get XYZ tile URL for visualizing Planetary Computer data via their tile server
 */
export function getPCTileUrl(params: {
  collection: string;
  item: string;
  assets?: string[];
  expression?: string;
  rescale?: string;
  colormap?: string;
}): string {
  const { collection, item, assets, expression, rescale, colormap } = params;

  const baseUrl =
    `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/${collection}/${item}`;
  const url = new URL(`${baseUrl}/WebMercatorQuad/{z}/{x}/{y}`);

  if (assets) url.searchParams.set("assets", assets.join(","));
  if (expression) url.searchParams.set("expression", expression);
  if (rescale) url.searchParams.set("rescale", rescale);
  if (colormap) url.searchParams.set("colormap_name", colormap);

  return url.toString();
}

/**
 * Get NDVI tile URL for a specific Sentinel-2 item
 */
export function getNDVITileUrl(itemId: string): string {
  return getPCTileUrl({
    collection: "sentinel-2-l2a",
    item: itemId,
    expression: "(B08-B04)/(B08+B04)",
    rescale: "-0.2,1",
    colormap: "rdylgn",
  });
}
