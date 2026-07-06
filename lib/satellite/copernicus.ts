/**
 * Copernicus Data Space Ecosystem API Client
 * For accessing Sentinel-2 L2A imagery
 * Docs: https://documentation.dataspace.copernicus.eu/
 */

import { env } from "$utils/env.ts";

interface CopernicusAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

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
    "s2:processing_baseline"?: string;
    "sat:relative_orbit"?: number;
    "s2:product_type"?: string;
    title?: string;
  };
  assets: Record<
    string,
    {
      href: string;
      type?: string;
      title?: string;
      "eo:bands"?: Array<{ name: string; common_name?: string }>;
    }
  >;
  links: Array<{ rel: string; href: string; type?: string }>;
}

interface STACSearchResult {
  type: "FeatureCollection";
  features: STACFeature[];
  numberMatched?: number;
  numberReturned?: number;
}

export interface SentinelProduct {
  productId: string;
  acquisitionTime: Date;
  cloudCoverPct: number;
  boundingBox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  orbitNumber: number;
  processingLevel: string;
  assets: {
    b04Red?: string; // Band 4 - Red (10m)
    b08Nir?: string; // Band 8 - NIR (10m)
    b03Green?: string; // Band 3 - Green (10m)
    b02Blue?: string; // Band 2 - Blue (10m)
    scl?: string; // Scene Classification Layer
    thumbnail?: string;
  };
}

const COPERNICUS_AUTH_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const COPERNICUS_STAC_URL = "https://catalogue.dataspace.copernicus.eu/stac";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAuthToken(): Promise<string> {
  // Check cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = env.COPERNICUS_CLIENT_ID;
  const clientSecret = env.COPERNICUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET",
    );
  }

  const response = await fetch(COPERNICUS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Copernicus auth failed: ${response.status}`);
  }

  const data: CopernicusAuthToken = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export async function searchSentinel2Products(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
  limit?: number;
}): Promise<SentinelProduct[]> {
  const { bbox, startDate, endDate, maxCloudCover = 30, limit = 50 } = params;

  // Build STAC search query
  const searchBody = {
    collections: ["SENTINEL-2"],
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
    query: {
      "eo:cloud_cover": { lte: maxCloudCover },
      "s2:product_type": { eq: "S2MSI2A" }, // L2A products
    },
  };

  const token = await getAuthToken();

  const response = await fetch(`${COPERNICUS_STAC_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`STAC search failed: ${response.status} - ${text}`);
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
    orbitNumber: feature.properties["sat:relative_orbit"] || 0,
    processingLevel: "L2A",
    assets: {
      b04Red: feature.assets?.B04?.href,
      b08Nir: feature.assets?.B08?.href,
      b03Green: feature.assets?.B03?.href,
      b02Blue: feature.assets?.B02?.href,
      scl: feature.assets?.SCL?.href,
      thumbnail: feature.assets?.thumbnail?.href ||
        feature.assets?.visual?.href,
    },
  }));
}

/**
 * Extract pixel values from a COG (Cloud Optimized GeoTIFF) at a specific point
 * Uses HTTP range requests to only fetch the needed tiles
 */
export async function extractPixelValue(
  cogUrl: string,
  lon: number,
  lat: number,
): Promise<number | null> {
  const _token = await getAuthToken();

  // Use GDAL-like approach via proxy service or direct COG reading
  // This requires Sentinel Hub credentials - alternative approach
  // For now, return null and use the batch processing approach
  console.log(
    `[SATELLITE] Would extract value from ${cogUrl} at ${lon},${lat}`,
  );
  return null;
}

/**
 * Calculate NDVI from Red and NIR bands
 * NDVI = (NIR - Red) / (NIR + Red)
 */
export function calculateNDVI(nir: number, red: number): number {
  if (nir + red === 0) return 0;
  const ndvi = (nir - red) / (nir + red);
  return Math.max(-1, Math.min(1, ndvi));
}

/**
 * Calculate EVI (Enhanced Vegetation Index)
 * EVI = 2.5 * (NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1)
 */
export function calculateEVI(
  nir: number,
  red: number,
  blue: number,
): number {
  const denominator = nir + 6 * red - 7.5 * blue + 1;
  if (denominator === 0) return 0;
  const evi = 2.5 * (nir - red) / denominator;
  return Math.max(-1, Math.min(1, evi));
}
