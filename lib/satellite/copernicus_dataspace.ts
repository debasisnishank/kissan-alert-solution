/**
 * Copernicus Data Space Ecosystem (CDSE) Integration
 * https://dataspace.copernicus.eu/
 *
 * Free tier available with registration
 * Provides: Sentinel-1/2/3/5P, Landsat, MODIS
 */

interface CDSESearchParams {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  startDate: string;
  endDate: string;
  collection?: "SENTINEL-2" | "SENTINEL-1" | "SENTINEL-3" | "LANDSAT";
  maxCloudCover?: number;
  limit?: number;
}

interface CDSEProduct {
  id: string;
  name: string;
  acquisitionDate: string;
  cloudCover: number;
  geometry: GeoJSON.Polygon;
  thumbnail?: string;
  downloadUrl?: string;
  metadata: {
    platform: string;
    instrument: string;
    processingLevel: string;
    orbitNumber?: number;
    relativeOrbitNumber?: number;
  };
}

interface CDSESearchResult {
  products: CDSEProduct[];
  totalResults: number;
  source: "copernicus_dataspace";
}

// CDSE OpenSearch API endpoint
const CDSE_CATALOG_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1";
const CDSE_STAC_URL = "https://catalogue.dataspace.copernicus.eu/stac";

/**
 * Search Copernicus Data Space catalog using OData API
 */
export async function searchCDSE(
  params: CDSESearchParams,
): Promise<CDSESearchResult> {
  const {
    bbox,
    startDate,
    endDate,
    collection = "SENTINEL-2",
    maxCloudCover = 30,
    limit = 10,
  } = params;

  // Build OData filter
  const polygon =
    `POLYGON((${bbox.minLon} ${bbox.minLat},${bbox.maxLon} ${bbox.minLat},${bbox.maxLon} ${bbox.maxLat},${bbox.minLon} ${bbox.maxLat},${bbox.minLon} ${bbox.minLat}))`;

  const filters = [
    `Collection/Name eq '${collection}'`,
    `ContentDate/Start ge ${startDate}T00:00:00.000Z`,
    `ContentDate/Start le ${endDate}T23:59:59.999Z`,
    `OData.CSC.Intersects(area=geography'SRID=4326;${polygon}')`,
  ];

  if (collection === "SENTINEL-2") {
    filters.push(
      `Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le ${maxCloudCover})`,
    );
  }

  const filterStr = filters.join(" and ");
  const url = `${CDSE_CATALOG_URL}/Products?$filter=${
    encodeURIComponent(filterStr)
  }&$top=${limit}&$orderby=ContentDate/Start desc`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`CDSE API error: ${response.status}`);
    }

    const data = await response.json();
    const products: CDSEProduct[] = (data.value || []).map(
      (item: Record<string, unknown>) => ({
        id: item.Id as string,
        name: item.Name as string,
        acquisitionDate: item.ContentDate?.Start as string,
        cloudCover: extractCloudCover(item),
        geometry: item.GeoFootprint as GeoJSON.Polygon,
        thumbnail: item.Assets?.[0]?.DownloadLink,
        downloadUrl: item["@odata.mediaReadLink"] as string | undefined,
        metadata: {
          platform: extractAttribute(item, "platformShortName") || collection,
          instrument: extractAttribute(item, "instrumentShortName") || "MSI",
          processingLevel: extractAttribute(item, "processingLevel") || "L2A",
          orbitNumber: Number(extractAttribute(item, "orbitNumber")) ||
            undefined,
          relativeOrbitNumber:
            Number(extractAttribute(item, "relativeOrbitNumber")) || undefined,
        },
      }),
    );

    return {
      products,
      totalResults: data["@odata.count"] || products.length,
      source: "copernicus_dataspace",
    };
  } catch (error) {
    console.error("[CDSE] Search error:", error);
    return { products: [], totalResults: 0, source: "copernicus_dataspace" };
  }
}

function extractCloudCover(item: Record<string, unknown>): number {
  const attrs = item.Attributes as Array<{ Name: string; Value: number }>;
  if (!attrs) return 0;
  const cloudAttr = attrs.find((a) => a.Name === "cloudCover");
  return cloudAttr?.Value ?? 0;
}

function extractAttribute(
  item: Record<string, unknown>,
  name: string,
): string | undefined {
  const attrs = item.Attributes as Array<{ Name: string; Value: string }>;
  if (!attrs) return undefined;
  const attr = attrs.find((a) => a.Name === name);
  return attr?.Value;
}

/**
 * Search using STAC API (alternative method)
 */
export async function searchCDSEStac(
  params: CDSESearchParams,
): Promise<CDSESearchResult> {
  const { bbox, startDate, endDate, collection = "SENTINEL-2", limit = 10 } =
    params;

  const collectionMap: Record<string, string> = {
    "SENTINEL-2": "sentinel-2-l2a",
    "SENTINEL-1": "sentinel-1-grd",
    "SENTINEL-3": "sentinel-3-olci-efr",
    LANDSAT: "landsat-c2-l2",
  };

  const body = {
    collections: [collectionMap[collection] || "sentinel-2-l2a"],
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
    datetime: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    limit,
  };

  try {
    const response = await fetch(`${CDSE_STAC_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`CDSE STAC error: ${response.status}`);
    }

    const data = await response.json();
    const products: CDSEProduct[] = (data.features || []).map(
      (f: Record<string, unknown>) => {
        const props = f.properties as Record<string, unknown>;
        return {
          id: f.id as string,
          name: props.title as string || f.id as string,
          acquisitionDate: props.datetime as string,
          cloudCover: (props["eo:cloud_cover"] as number) || 0,
          geometry: f.geometry as GeoJSON.Polygon,
          thumbnail: (f.assets as Record<string, { href: string }>)?.thumbnail
            ?.href,
          metadata: {
            platform: props.platform as string || "Sentinel-2",
            instrument: props.instruments?.[0] as string || "MSI",
            processingLevel: props["processing:level"] as string || "L2A",
          },
        };
      },
    );

    return {
      products,
      totalResults: data.numberMatched || products.length,
      source: "copernicus_dataspace",
    };
  } catch (error) {
    console.error("[CDSE STAC] Search error:", error);
    return { products: [], totalResults: 0, source: "copernicus_dataspace" };
  }
}

/**
 * Get Sentinel-2 NDVI from CDSE WMS
 */
export function getCDSENdviWmsUrl(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  date: string;
  width?: number;
  height?: number;
}): string {
  const { bbox, date, width = 512, height = 512 } = params;
  const baseUrl = "https://sh.dataspace.copernicus.eu/ogc/wms";

  // Requires CDSE account and instance ID
  const instanceId = Deno.env.get("CDSE_INSTANCE_ID") || "default";

  return `${baseUrl}/${instanceId}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=NDVI&FORMAT=image/png&WIDTH=${width}&HEIGHT=${height}&CRS=EPSG:4326&BBOX=${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}&TIME=${date}`;
}

export type { CDSEProduct, CDSESearchParams, CDSESearchResult };
