/**
 * USGS Earth Explorer / Landsat STAC API Client
 * For accessing Landsat 8/9 imagery
 * Uses the free USGS STAC API (no auth required for search)
 */

const USGS_STAC_URL = "https://landsatlook.usgs.gov/stac-server";

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
    "landsat:wrs_path"?: number;
    "landsat:wrs_row"?: number;
    "landsat:collection_category"?: string;
    "landsat:collection_number"?: string;
    platform?: string;
  };
  assets: Record<
    string,
    {
      href: string;
      type?: string;
      title?: string;
    }
  >;
}

interface STACSearchResult {
  type: "FeatureCollection";
  features: STACFeature[];
  numberMatched?: number;
  numberReturned?: number;
  context?: { matched?: number; returned?: number };
}

export interface LandsatProduct {
  productId: string;
  acquisitionTime: Date;
  cloudCoverPct: number;
  boundingBox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  wrsPath: number;
  wrsRow: number;
  platform: string;
  assets: {
    b4Red?: string; // Band 4 - Red
    b5Nir?: string; // Band 5 - NIR
    b3Green?: string;
    b2Blue?: string;
    qa?: string; // Quality Assessment
    thumbnail?: string;
  };
}

export async function searchLandsatProducts(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
  collections?: string[];
}): Promise<LandsatProduct[]> {
  const {
    bbox,
    startDate,
    endDate,
    maxCloudCover = 30,
    limit = 50,
    collections = ["landsat-c2l2-sr"], // Surface Reflectance Level 2
  } = params;

  const searchBody = {
    collections,
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
    query: {
      "eo:cloud_cover": { lte: maxCloudCover },
    },
  };

  const response = await fetch(`${USGS_STAC_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Landsat STAC search failed: ${response.status} - ${text}`);
  }

  const result: STACSearchResult = await response.json();

  return result.features.map((feature) => ({
    productId: feature.id,
    acquisitionTime: new Date(feature.properties.datetime),
    cloudCoverPct: feature.properties["eo:cloud_cover"] || 0,
    boundingBox: {
      minLon: feature.bbox[0],
      minLat: feature.bbox[1],
      maxLon: feature.bbox[2],
      maxLat: feature.bbox[3],
    },
    wrsPath: feature.properties["landsat:wrs_path"] || 0,
    wrsRow: feature.properties["landsat:wrs_row"] || 0,
    platform: feature.properties.platform || "landsat-8",
    assets: {
      b4Red: feature.assets?.red?.href || feature.assets?.SR_B4?.href,
      b5Nir: feature.assets?.nir08?.href || feature.assets?.SR_B5?.href,
      b3Green: feature.assets?.green?.href || feature.assets?.SR_B3?.href,
      b2Blue: feature.assets?.blue?.href || feature.assets?.SR_B2?.href,
      qa: feature.assets?.qa_pixel?.href,
      thumbnail: feature.assets?.thumbnail?.href,
    },
  }));
}

/**
 * Search for Landsat Collection 2 data using USGS M2M API
 * This requires USGS Earth Explorer account
 */
export function searchViaM2M(
  _bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  _startDate: string,
  _endDate: string,
): Promise<LandsatProduct[]> {
  // M2M API requires registration at https://ers.cr.usgs.gov/
  // For now, use the STAC API which is freely available
  console.log("[LANDSAT] M2M API not implemented, using STAC API");
  return [];
}
