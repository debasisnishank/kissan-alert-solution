/**
 * Satellite Data Module
 * Provides unified access to satellite imagery, weather, soil, and market data
 *
 * Data Sources (with automatic fallback chains):
 * 1. Copernicus Data Space - Sentinel-1/2/3, Landsat
 * 2. Element 84 Earth Search - free STAC API
 * 3. NASA GIBS - free WMTS/WMS for MODIS, GPM, SMAP
 * 4. NASA POWER - Agricultural meteorology, climatology
 * 5. Microsoft Planetary Computer - free STAC
 * 6. SoilGrids (ISRIC) - Global soil data at 250m
 * 7. ISRO Bhuvan - Indian satellite data, thematic maps
 * 8. Open-Meteo - Weather forecasts, soil moisture
 * 9. Ola Maps - Indian geocoding, places, routing
 * 10. Agmarknet - Indian market prices
 */

// ========== UNIFIED DATA PROVIDER ==========
export {
  type ComprehensiveFarmData,
  formatDataForExport,
  getAllMapLayers,
  getComprehensiveFarmData,
} from "./unified_data.ts";

// ========== COPERNICUS DATA SPACE ==========
export {
  type CDSEProduct,
  type CDSESearchParams,
  type CDSESearchResult,
  getCDSENdviWmsUrl,
  searchCDSE,
  searchCDSEStac,
} from "./copernicus_dataspace.ts";

// ========== SOILGRIDS (ISRIC) ==========
export {
  getFarmSoilProfile,
  getSoilGridsData,
  getSoilGridsWcsUrl,
  type SoilData,
  type SoilDepth,
  type SoilGridsParams,
  type SoilGridsResult,
  type SoilProperty,
} from "./soilgrids.ts";

// ========== NASA POWER ==========
export {
  getAgriWeatherSummary,
  getClimatology,
  getNASAPowerDaily,
  type NASAPowerParams,
  type NASAPowerResult,
  type PowerDailyData,
  type PowerParameter,
} from "./nasa_power.ts";

// ========== ISRO BHUVAN ==========
export {
  BHUVAN_LAYERS,
  type BhuvanLayerConfig,
  createBhuvanWMSLayer,
  getAgricultureLayers,
  getBhuvanFeatureInfo,
  getBhuvanLeafletLayer,
  getBhuvanTileUrl,
  getBhuvanWmsUrl,
  getLULCClass,
} from "./bhuvan.ts";

// ========== UNIFIED CLIENT (Element84 + PC) ==========
export {
  getMapLayers,
  getStaticMapImage,
  type SatelliteProduct,
  searchAllSatelliteSources,
  searchLandsatWithFallback,
  type SearchParams,
  searchSentinel2WithFallback,
} from "./client.ts";

// ========== ELEMENT 84 EARTH SEARCH ==========
export {
  searchLandsat as searchLandsatElement84,
  searchSentinel2 as searchSentinel2Element84,
} from "./element84.ts";

// ========== NASA GIBS ==========
export {
  getLeafletTileUrl,
  getNDVIImage,
  getPrecipitationImage,
  getWMSImageUrl,
  getWMTSTileUrl,
  GIBS_LAYERS,
} from "./nasa_gibs.ts";

// ========== MICROSOFT PLANETARY COMPUTER ==========
export {
  getNDVITileUrl,
  searchLandsat as searchLandsatPC,
  searchSentinel2 as searchSentinel2PC,
} from "./planetary_computer.ts";

// ========== LEGACY COPERNICUS ==========
export {
  calculateEVI,
  calculateNDVI,
  searchSentinel2Products,
} from "./copernicus.ts";

// ========== OPEN-METEO WEATHER ==========
export {
  checkWeatherAlerts,
  getDailyWeather,
  getHourlyWeather,
  getRainfallLast24h,
  getSoilData,
  type HourlyWeatherData,
  type WeatherData,
} from "./weather.ts";

// ========== GROUNDWATER ==========
export {
  getGroundwaterPotential,
  groundwaterCapacityMultiplier,
  type GroundwaterData,
  groundwaterLabel,
  type GroundwaterPotential,
} from "./groundwater.ts";

// ========== AGMARKNET MARKET PRICES ==========
export {
  getAgmarknetPrices,
  getNearbyMandis,
  getPriceTrend,
  type MarketPrice,
} from "./market.ts";

// ========== NDVI EXTRACTION ==========
export {
  extractCompleteFarmData,
  extractFarmVegetationIndices,
  type FarmObservationData,
  getCurrentFarmHealth,
  type VegetationIndex,
} from "./ndvi_extractor.ts";
