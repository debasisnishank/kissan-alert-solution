/**
 * Maps Module
 * Provides geocoding, routing, and places search
 *
 * Data Sources (with fallbacks):
 * 1. Ola Maps - Indian mapping service
 * 2. Nominatim (OpenStreetMap) - Free global geocoding
 * 3. ISRO Bhuvan - Indian geospatial data
 */

// Ola Maps
export {
  geocode as olaGeocode,
  getDirections as olaGetDirections,
  getOlaTileUrl,
  getStaticMapUrl as olaGetStaticMap,
  type OlaDirectionsResult,
  type OlaGeocodingResult,
  type OlaPlaceResult,
  reverseGeocode as olaReverseGeocode,
  searchNearbyPlaces as olaSearchNearby,
} from "./ola.ts";

// Nominatim (OSM)
export {
  geocodeNominatim,
  type GeocodingResult,
  reverseGeocodeNominatim,
  type ReverseGeocodingResult,
  searchPlaces,
} from "./geocoding.ts";

// Map configurations
export {
  getBhuvanConfig,
  getLeafletConfig,
  getOpenLayersConfig,
  MAP_CONFIGS,
  type MapConfig,
} from "./config.ts";
