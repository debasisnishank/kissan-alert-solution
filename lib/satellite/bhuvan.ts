/**
 * ISRO Bhuvan Portal Integration
 * https://bhuvan.nrsc.gov.in/
 *
 * India's national geo-portal by ISRO/NRSC
 * Provides: WMS/WMTS layers, Indian satellite data, thematic maps
 */

interface BhuvanLayerConfig {
  name: string;
  title: string;
  category: "satellite" | "thematic" | "admin" | "agriculture";
  description: string;
}

// Bhuvan WMS/WMTS endpoints
const BHUVAN_WMS = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms";
const BHUVAN_WMS_THEMATIC = "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms";
const BHUVAN_WMTS = "https://bhuvan-ras2.nrsc.gov.in/tiles";

// Available Bhuvan layers
export const BHUVAN_LAYERS: Record<string, BhuvanLayerConfig> = {
  // Satellite imagery
  CARTOSAT: {
    name: "india3d:cartosat",
    title: "CartoSAT DEM",
    category: "satellite",
    description: "30m Digital Elevation Model from CartoSAT",
  },
  LISS4: {
    name: "india3d:liss4",
    title: "LISS-IV Imagery",
    category: "satellite",
    description: "5.8m multispectral from Resourcesat",
  },
  LISS3: {
    name: "india3d:liss3",
    title: "LISS-III Imagery",
    category: "satellite",
    description: "23.5m multispectral from Resourcesat",
  },

  // Thematic layers
  LULC: {
    name: "lulc:lulc_250k",
    title: "Land Use Land Cover",
    category: "thematic",
    description: "1:250k Land Use Land Cover map",
  },
  SOIL: {
    name: "soil:soil_type",
    title: "Soil Type Map",
    category: "agriculture",
    description: "Soil classification map of India",
  },
  WATERSHED: {
    name: "watershed:watershed",
    title: "Watershed Boundaries",
    category: "thematic",
    description: "Watershed delineation",
  },
  GROUNDWATER: {
    // "groundwater:gw_prospect" does not exist on the server (confirmed:
    // WMS returns ServiceException LayerNotDefined for every location).
    // cgwb:cgwb_depth is a real layer per Bhuvan's GetCapabilities and is
    // used as a best guess -- pending live verification once their WMS
    // backend (bhuvan-vec1/vec2) responds again. Per-state fallback
    // layers also exist (gw:<STATE_NAME>_PRE / _POST) if this doesn't
    // pan out.
    name: "cgwb:cgwb_depth",
    title: "CGWB Depth to Water Level",
    category: "thematic",
    description: "Groundwater depth-to-water-level (CGWB)",
  },

  // Agricultural layers
  CROP_INTENSITY: {
    name: "agriculture:crop_intensity",
    title: "Crop Intensity",
    category: "agriculture",
    description: "Cropping intensity map",
  },
  IRRIGATION: {
    name: "agriculture:irrigation_status",
    title: "Irrigation Status",
    category: "agriculture",
    description: "Irrigated vs rainfed areas",
  },
  NDVI_INDIA: {
    name: "ndvi:ndvi_india",
    title: "NDVI India",
    category: "agriculture",
    description: "Vegetation index from Indian satellites",
  },

  // Administrative
  INDIA_STATES: {
    name: "india_admin:state_boundary",
    title: "State Boundaries",
    category: "admin",
    description: "Indian state boundaries",
  },
  INDIA_DISTRICTS: {
    name: "india_admin:district_boundary",
    title: "District Boundaries",
    category: "admin",
    description: "Indian district boundaries",
  },
  INDIA_VILLAGES: {
    name: "india_admin:village_boundary",
    title: "Village Boundaries",
    category: "admin",
    description: "Indian village boundaries",
  },
};

/**
 * Get Bhuvan WMS URL for a layer
 */
export function getBhuvanWmsUrl(params: {
  layer: keyof typeof BHUVAN_LAYERS | string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  width?: number;
  height?: number;
  format?: "image/png" | "image/jpeg";
  transparent?: boolean;
}): string {
  const {
    layer,
    bbox,
    width = 512,
    height = 512,
    format = "image/png",
    transparent = true,
  } = params;

  const layerConfig = BHUVAN_LAYERS[layer];
  const layerName = layerConfig?.name || layer;
  const baseUrl = layerConfig?.category === "thematic"
    ? BHUVAN_WMS_THEMATIC
    : BHUVAN_WMS;

  return `${baseUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layerName}&STYLES=&FORMAT=${format}&TRANSPARENT=${transparent}&SRS=EPSG:4326&BBOX=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}&WIDTH=${width}&HEIGHT=${height}`;
}

/**
 * Get Bhuvan tile URL for Leaflet
 */
export function getBhuvanTileUrl(
  layer: keyof typeof BHUVAN_LAYERS | string,
): string {
  const layerConfig = BHUVAN_LAYERS[layer];
  const layerName = layerConfig?.name || layer;

  return `${BHUVAN_WMTS}/${layerName}/{z}/{x}/{y}.png`;
}

/**
 * Get Bhuvan Leaflet layer configuration
 */
export function getBhuvanLeafletLayer(
  layer: keyof typeof BHUVAN_LAYERS,
): {
  url: string;
  options: {
    layers: string;
    format: string;
    transparent: boolean;
    attribution: string;
  };
} {
  const config = BHUVAN_LAYERS[layer];

  return {
    url: BHUVAN_WMS,
    options: {
      layers: config.name,
      format: "image/png",
      transparent: true,
      attribution: "ISRO/NRSC Bhuvan",
    },
  };
}

/**
 * Get feature info from Bhuvan WMS (GetFeatureInfo)
 */
export async function getBhuvanFeatureInfo(params: {
  layer: keyof typeof BHUVAN_LAYERS | string;
  lat: number;
  lon: number;
}): Promise<Record<string, unknown> | null> {
  const { layer, lat, lon } = params;
  const layerConfig = BHUVAN_LAYERS[layer];
  const layerName = layerConfig?.name || layer;
  const baseUrl = layerConfig?.category === "thematic"
    ? BHUVAN_WMS_THEMATIC
    : BHUVAN_WMS;

  // Create a small bbox around the point
  const delta = 0.001;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;

  const url =
    `${baseUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=${layerName}&QUERY_LAYERS=${layerName}&INFO_FORMAT=application/json&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=101&HEIGHT=101&X=50&Y=50`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    return data.features?.[0]?.properties || null;
  } catch (error) {
    console.error("[Bhuvan] GetFeatureInfo error:", error);
    return null;
  }
}

/**
 * Get LULC (Land Use Land Cover) class for a location
 */
export async function getLULCClass(
  lat: number,
  lon: number,
): Promise<
  {
    class: string;
    category: string;
    description: string;
  } | null
> {
  const info = await getBhuvanFeatureInfo({
    layer: "LULC",
    lat,
    lon,
  });

  if (!info) return null;

  const lulcCode = info.lulc_code || info.class_code || info.LULC_CODE;
  return {
    class: String(lulcCode || "Unknown"),
    category: getLULCCategory(String(lulcCode)),
    description: String(info.description || info.class_name || ""),
  };
}

function getLULCCategory(code: string): string {
  const categories: Record<string, string> = {
    "1": "Built-up",
    "2": "Agriculture",
    "3": "Forest",
    "4": "Grassland",
    "5": "Wetland",
    "6": "Barren",
    "7": "Water",
    "8": "Snow/Ice",
  };
  return categories[code.charAt(0)] || "Unknown";
}

/**
 * Get available Bhuvan layers for agriculture
 */
export function getAgricultureLayers(): BhuvanLayerConfig[] {
  return Object.values(BHUVAN_LAYERS).filter(
    (l) => l.category === "agriculture" || l.category === "thematic",
  );
}

/**
 * Construct Bhuvan WMS layer for OpenLayers/Leaflet
 */
export function createBhuvanWMSLayer(
  layerKey: keyof typeof BHUVAN_LAYERS,
): {
  type: "wms";
  url: string;
  params: {
    LAYERS: string;
    FORMAT: string;
    TRANSPARENT: boolean;
  };
  attribution: string;
} {
  const config = BHUVAN_LAYERS[layerKey];
  return {
    type: "wms",
    url: BHUVAN_WMS,
    params: {
      LAYERS: config.name,
      FORMAT: "image/png",
      TRANSPARENT: true,
    },
    attribution: `${config.title} - ISRO/NRSC Bhuvan`,
  };
}

export type { BhuvanLayerConfig };
