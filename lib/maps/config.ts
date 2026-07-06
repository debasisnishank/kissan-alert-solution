/**
 * Map Configuration for Leaflet
 * Base layers: ISRO Bhuvan, Ola Maps, OpenStreetMap
 * Overlay layers: Sentinel-2, NDVI, Weather
 */

import { env } from "$utils/env.ts";

export interface MapLayer {
  id: string;
  name: string;
  url: string;
  type: "wms" | "wmts" | "xyz";
  attribution: string;
  options?: Record<string, unknown>;
}

// Base map layers (for boundary visualization)
export const BASE_LAYERS: MapLayer[] = [
  {
    id: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    type: "xyz",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: "bhuvan",
    name: "ISRO Bhuvan",
    url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
    type: "wms",
    attribution: '&copy; <a href="https://bhuvan.nrsc.gov.in">ISRO Bhuvan</a>',
    options: {
      layers: "india_village",
      format: "image/png",
      transparent: true,
    },
  },
  {
    id: "bhuvan_satellite",
    name: "Bhuvan Satellite",
    url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
    type: "wms",
    attribution: '&copy; <a href="https://bhuvan.nrsc.gov.in">ISRO Bhuvan</a>',
    options: {
      layers: "liss3_mx",
      format: "image/png",
    },
  },
  {
    id: "esri_satellite",
    name: "ESRI Satellite",
    url:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    type: "xyz",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye",
  },
];

// Get Ola Maps base URL (if configured)
export function getOlaMapsUrl(): string | null {
  const apiKey = env.OLA_MAPS_API_KEY;
  if (!apiKey) return null;

  return `https://api.olamaps.io/tiles/vector/v1/styles/default/static`;
}

// Overlay layers for farm analysis
export const OVERLAY_LAYERS = {
  // ISRO Bhuvan layers for India
  bhuvan: {
    boundaries: {
      name: "Village Boundaries",
      url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
      layers: "india_village",
      format: "image/png",
      transparent: true,
    },
    cadastral: {
      name: "Cadastral Map",
      url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
      layers: "clcmp_clcmb",
      format: "image/png",
      transparent: true,
    },
    lulc: {
      name: "Land Use Land Cover",
      url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
      layers: "LULC50K",
      format: "image/png",
      transparent: true,
    },
    ndvi: {
      name: "NDVI (Bhuvan)",
      url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
      layers: "NDVI_AWIFS",
      format: "image/png",
      transparent: true,
    },
  },

  // NASA GIBS layers (global)
  gibs: {
    ndvi: {
      name: "MODIS NDVI",
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi",
      layers: "MODIS_Terra_NDVI_8Day",
      format: "image/png",
      tileMatrixSet: "250m",
    },
    trueColor: {
      name: "MODIS True Color",
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi",
      layers: "MODIS_Terra_CorrectedReflectance_TrueColor",
      format: "image/jpeg",
      tileMatrixSet: "250m",
    },
    precipitation: {
      name: "GPM Precipitation",
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi",
      layers: "GPM_3IMERGDF_Precipitation",
      format: "image/png",
      tileMatrixSet: "2km",
    },
  },

  // Copernicus CDSE (Sentinel-2)
  sentinel: {
    wms: {
      name: "Sentinel-2 True Color",
      // This requires Copernicus Browser / CDSE access
      url: "https://sh.dataspace.copernicus.eu/ogc/wms",
      layers: "TRUE-COLOR-S2L2A",
    },
    ndvi: {
      name: "Sentinel-2 NDVI",
      url: "https://sh.dataspace.copernicus.eu/ogc/wms",
      layers: "NDVI",
    },
  },
};

// Default map center (India)
export const DEFAULT_CENTER = {
  lat: 20.5937,
  lng: 78.9629,
  zoom: 5,
};

// India bounds for restricting map view
export const INDIA_BOUNDS = {
  north: 37.0,
  south: 6.0,
  east: 97.5,
  west: 68.0,
};

/**
 * Get Leaflet configuration for the map
 */
export function getLeafletConfig() {
  return {
    center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng] as [number, number],
    zoom: DEFAULT_CENTER.zoom,
    maxBounds: [
      [INDIA_BOUNDS.south, INDIA_BOUNDS.west],
      [INDIA_BOUNDS.north, INDIA_BOUNDS.east],
    ] as [[number, number], [number, number]],
    maxBoundsViscosity: 1.0,
  };
}

/**
 * Get WMS params for a Bhuvan layer
 */
export function getBhuvanWMSParams(
  layerKey: keyof typeof OVERLAY_LAYERS.bhuvan,
) {
  const layer = OVERLAY_LAYERS.bhuvan[layerKey];
  return {
    url: layer.url,
    params: {
      layers: layer.layers,
      format: layer.format,
      transparent: layer.transparent,
      crs: "EPSG:4326",
    },
  };
}

/**
 * Get WMTS params for NASA GIBS layer
 */
export function getGIBSWMTSParams(
  layerKey: keyof typeof OVERLAY_LAYERS.gibs,
  date: string,
) {
  const layer = OVERLAY_LAYERS.gibs[layerKey];
  return {
    url: layer.url,
    params: {
      layer: layer.layers,
      style: "default",
      format: layer.format,
      time: date,
      tileMatrixSet: layer.tileMatrixSet,
    },
  };
}
