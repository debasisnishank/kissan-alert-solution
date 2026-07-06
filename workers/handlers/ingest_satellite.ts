/**
 * Satellite Catalog Ingestion Handler
 * Fetches satellite product metadata from FREE APIs (no auth required):
 * - Element 84 Earth Search (primary)
 * - Microsoft Planetary Computer (fallback)
 * - Copernicus CDSE (fallback, requires auth)
 */

import { execute } from "$db/client.ts";
import {
  searchLandsatWithFallback,
  searchSentinel2WithFallback,
} from "$lib/satellite/client.ts";

interface IngestSatelliteCatalogPayload {
  source: "sentinel-2" | "landsat" | "all";
  bbox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  startDate: string;
  endDate: string;
  maxCloudCover?: number;
}

interface CatalogProduct {
  productId: string;
  acquisitionTime: Date;
  cloudCoverPct: number;
  boundingBox: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  orbitNumber?: number;
  processingLevel: string;
  source: string;
  assets?: Record<string, string>;
}

async function searchCatalog(
  payload: IngestSatelliteCatalogPayload,
): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  const { bbox, startDate, endDate, maxCloudCover = 30 } = payload;

  // Search Sentinel-2 using free APIs with fallback
  if (payload.source === "sentinel-2" || payload.source === "all") {
    const result = await searchSentinel2WithFallback({
      bbox,
      startDate,
      endDate,
      maxCloudCover,
      limit: 100,
    });

    console.log(
      `[SATELLITE] Sentinel-2 via ${result.source}: ${result.products.length} products`,
    );

    for (const p of result.products) {
      products.push({
        productId: p.productId,
        acquisitionTime: p.acquisitionTime,
        cloudCoverPct: p.cloudCoverPct,
        boundingBox: p.boundingBox,
        orbitNumber: p.orbitNumber,
        processingLevel: "L2A",
        source: "sentinel-2",
        assets: p.assets as Record<string, string>,
      });
    }
  }

  // Search Landsat using free APIs with fallback
  if (payload.source === "landsat" || payload.source === "all") {
    const result = await searchLandsatWithFallback({
      bbox,
      startDate,
      endDate,
      maxCloudCover,
      limit: 100,
    });

    console.log(
      `[SATELLITE] Landsat via ${result.source}: ${result.products.length} products`,
    );

    for (const p of result.products) {
      products.push({
        productId: p.productId,
        acquisitionTime: p.acquisitionTime,
        cloudCoverPct: p.cloudCoverPct,
        boundingBox: p.boundingBox,
        orbitNumber: p.orbitNumber,
        processingLevel: "L2",
        source: "landsat",
        assets: p.assets as Record<string, string>,
      });
    }
  }

  return products;
}

export async function handleIngestSatelliteCatalog(
  payload: IngestSatelliteCatalogPayload,
): Promise<{
  productsFound: number;
  productsInserted: number;
}> {
  console.log(
    `[JOB] Ingesting satellite catalog for source: ${payload.source}`,
  );
  console.log(
    `[JOB] Date range: ${payload.startDate} to ${payload.endDate}`,
  );
  console.log(
    `[JOB] Bounding box: ${JSON.stringify(payload.bbox)}`,
  );

  const products = await searchCatalog(payload);

  let inserted = 0;
  for (const product of products) {
    // Skip if cloud cover too high
    if (
      payload.maxCloudCover &&
      product.cloudCoverPct > payload.maxCloudCover
    ) {
      continue;
    }

    // Create bounding box as GeoJSON
    const bbox = product.boundingBox;
    const bboxGeoJSON = JSON.stringify({
      type: "Polygon",
      coordinates: [[
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.minLat],
        [bbox.maxLon, bbox.maxLat],
        [bbox.minLon, bbox.maxLat],
        [bbox.minLon, bbox.minLat],
      ]],
    });

    try {
      await execute(
        `INSERT INTO satellite_products (
          source, product_id, acquisition_time, cloud_cover_pct,
          bounding_box, orbit_number, processing_level, metadata
        ) VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5), $6, $7, $8)
        ON CONFLICT (product_id) DO UPDATE SET
          cloud_cover_pct = EXCLUDED.cloud_cover_pct,
          metadata = EXCLUDED.metadata`,
        [
          product.source,
          product.productId,
          product.acquisitionTime,
          product.cloudCoverPct,
          bboxGeoJSON,
          product.orbitNumber || null,
          product.processingLevel,
          JSON.stringify({ assets: product.assets }),
        ],
      );
      inserted++;
    } catch (error) {
      console.error(`Failed to insert product ${product.productId}:`, error);
    }
  }

  console.log(
    `[JOB] Satellite catalog ingestion complete: ${inserted}/${products.length} products inserted`,
  );

  return {
    productsFound: products.length,
    productsInserted: inserted,
  };
}

/**
 * Schedule regular ingestion for all active farms
 */
export async function scheduleRegularIngestion(): Promise<void> {
  // Get bounding boxes of all active farms
  const { query } = await import("$db/client.ts");

  const farms = await query<{
    min_lon: number;
    min_lat: number;
    max_lon: number;
    max_lat: number;
  }>(
    `SELECT 
      ST_XMin(ST_Envelope(polygon)) as min_lon,
      ST_YMin(ST_Envelope(polygon)) as min_lat,
      ST_XMax(ST_Envelope(polygon)) as max_lon,
      ST_YMax(ST_Envelope(polygon)) as max_lat
     FROM farms
     WHERE is_active = true
     GROUP BY tenant_id`,
    [],
  );

  // Combine into regional bboxes
  for (const farm of farms) {
    const today = new Date();
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    await handleIngestSatelliteCatalog({
      source: "all",
      bbox: {
        minLon: farm.min_lon,
        minLat: farm.min_lat,
        maxLon: farm.max_lon,
        maxLat: farm.max_lat,
      },
      startDate,
      endDate,
      maxCloudCover: 40,
    });
  }
}
