/**
 * NASA GIBS (Global Imagery Browse Services) Client
 * Provides free imagery tiles via WMTS
 * https://nasa-gibs.github.io/gibs-api-docs/
 * No authentication required!
 */

const GIBS_WMTS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
const GIBS_WMS_URL =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export interface GIBSLayer {
  id: string;
  title: string;
  format: string;
  tileMatrixSet: string;
  startDate?: string;
  endDate?: string;
}

// Key layers for agriculture
export const GIBS_LAYERS = {
  // MODIS Vegetation Indices
  MODIS_NDVI: "MODIS_Terra_NDVI_8Day",
  MODIS_EVI: "MODIS_Terra_EVI_8Day",

  // True Color
  MODIS_TRUE_COLOR: "MODIS_Terra_CorrectedReflectance_TrueColor",
  VIIRS_TRUE_COLOR: "VIIRS_SNPP_CorrectedReflectance_TrueColor",

  // Land Surface Temperature
  MODIS_LST_DAY: "MODIS_Terra_Land_Surface_Temp_Day_8Day",
  MODIS_LST_NIGHT: "MODIS_Terra_Land_Surface_Temp_Night_8Day",

  // Precipitation
  GPM_PRECIPITATION: "GPM_3IMERGDF_Precipitation",
  GPM_PRECIPITATION_DAILY: "GPM_3IMERGDL_Precipitation",

  // Soil Moisture
  SMAP_SOIL_MOISTURE: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",

  // Fire/Thermal
  MODIS_FIRES: "MODIS_Terra_Thermal_Anomalies_Day",
  VIIRS_FIRES: "VIIRS_SNPP_Thermal_Anomalies_375m_Day",
} as const;

/**
 * Get WMTS tile URL for a GIBS layer
 */
export function getWMTSTileUrl(
  _layer: string,
  date: string, // YYYY-MM-DD
  options?: {
    format?: string;
    tileMatrixSet?: string;
  },
): string {
  const format = options?.format || "image/png";
  const tileMatrixSet = options?.tileMatrixSet || "250m";

  return `${GIBS_WMTS_URL}/wmts.cgi?` +
    `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&` +
    `LAYER=${layer}&STYLE=default&FORMAT=${encodeURIComponent(format)}&` +
    `TIME=${date}&TILEMATRIXSET=${tileMatrixSet}&` +
    `TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
}

/**
 * Get WMS GetMap URL for a specific bbox
 */
export function getWMSImageUrl(params: {
  layer: string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  date: string;
  width?: number;
  height?: number;
  format?: string;
}): string {
  const { layer, bbox, date, width = 512, height = 512, format = "image/png" } =
    params;

  const bboxStr = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;

  return `${GIBS_WMS_URL}?` +
    `SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&` +
    `LAYERS=${layer}&CRS=EPSG:4326&` +
    `BBOX=${bboxStr}&WIDTH=${width}&HEIGHT=${height}&` +
    `FORMAT=${encodeURIComponent(format)}&TIME=${date}&STYLES=`;
}

/**
 * Get NDVI image from GIBS for a date range
 */
export function getNDVIImage(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  date: string;
  width?: number;
  height?: number;
}): Promise<string> {
  return getWMSImageUrl({
    layer: GIBS_LAYERS.MODIS_NDVI,
    bbox: params.bbox,
    date: params.date,
    width: params.width,
    height: params.height,
  });
}

/**
 * Get precipitation data from GPM
 */
export function getPrecipitationImage(params: {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  date: string;
}): Promise<string> {
  return getWMSImageUrl({
    layer: GIBS_LAYERS.GPM_PRECIPITATION_DAILY,
    bbox: params.bbox,
    date: params.date,
  });
}

/**
 * Get available dates for a layer
 */
export async function getAvailableDates(
  _layer: string,
): Promise<{ startDate: string; endDate: string } | null> {
  try {
    const response = await fetch(
      `${GIBS_WMTS_URL}/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities`,
    );
    if (!response.ok) return null;

    // Parse capabilities XML to find layer time dimension
    // For simplicity, return common date range
    const today = new Date();
    return {
      startDate: "2012-05-08", // MODIS/VIIRS start
      endDate: today.toISOString().split("T")[0],
    };
  } catch {
    return null;
  }
}

/**
 * Build Leaflet TileLayer URL template for GIBS
 */
export function getLeafletTileUrl(
  _layer: string,
  date: string,
  tileMatrixSet = "250m",
): string {
  return `${GIBS_WMTS_URL}/wmts.cgi?` +
    `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&` +
    `LAYER=${layer}&STYLE=default&FORMAT=image/png&` +
    `TIME=${date}&TILEMATRIXSET=${tileMatrixSet}&` +
    `TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
}

/**
 * Get color legend URL for a layer
 */
export function getColorbarUrl(layer: string): string {
  return `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${layer}.xml`;
}
