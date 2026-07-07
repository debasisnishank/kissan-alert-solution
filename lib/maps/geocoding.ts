/**
 * Geocoding Service
 * Free geocoding providers:
 * 1. Nominatim (OpenStreetMap) - primary
 * 2. ISRO Bhuvan (for India-specific)
 * 3. Ola Maps (if configured)
 */

import { env } from "$utils/env.ts";

export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  type: string;
  importance?: number;
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface ReverseGeocodingResult {
  address: {
    village?: string;
    town?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  displayName: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

/**
 * Forward geocoding using Nominatim (OpenStreetMap)
 * Rate limited to 1 request per second
 */
export async function geocodeNominatim(
  query: string,
  options?: {
    countryCode?: string;
    limit?: number;
  },
): Promise<GeocodingResult[]> {
  const { countryCode = "in", limit = 5 } = options || {};

  const url = new URL(`${NOMINATIM_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", countryCode);
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Khetscope-Agri-App/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status}`);
  }

  const data = await response.json();

  return data.map(
    (r: {
      lat: string;
      lon: string;
      display_name: string;
      type: string;
      importance: number;
      boundingbox: string[];
    }) => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      displayName: r.display_name,
      type: r.type,
      importance: r.importance,
      boundingBox: r.boundingbox
        ? {
          minLat: parseFloat(r.boundingbox[0]),
          maxLat: parseFloat(r.boundingbox[1]),
          minLon: parseFloat(r.boundingbox[2]),
          maxLon: parseFloat(r.boundingbox[3]),
        }
        : undefined,
    }),
  );
}

/**
 * Reverse geocoding using Nominatim
 */
export async function reverseGeocodeNominatim(
  lat: number,
  lon: number,
): Promise<ReverseGeocodingResult | null> {
  const url = new URL(`${NOMINATIM_URL}/reverse`);
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Khetscope-Agri-App/1.0",
    },
  });

  if (!response.ok) return null;

  const data = await response.json();

  if (data.error) return null;

  return {
    address: {
      village: data.address?.village,
      town: data.address?.town,
      city: data.address?.city,
      district: data.address?.county || data.address?.state_district,
      state: data.address?.state,
      country: data.address?.country,
      postcode: data.address?.postcode,
    },
    displayName: data.display_name,
  };
}

/**
 * Geocode using Ola Maps (if configured)
 */
export async function geocodeOlaMaps(
  query: string,
): Promise<GeocodingResult[]> {
  const apiKey = env.OLA_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[GEOCODE] Ola Maps API key not configured, using Nominatim");
    return geocodeNominatim(query);
  }

  try {
    const url = new URL("https://api.olamaps.io/places/v1/autocomplete");
    url.searchParams.set("input", query);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn("[GEOCODE] Ola Maps failed, falling back to Nominatim");
      return geocodeNominatim(query);
    }

    const data = await response.json();

    return (data.predictions || []).map(
      (p: {
        geometry: { location: { lat: number; lng: number } };
        description: string;
        types: string[];
      }) => ({
        lat: p.geometry?.location?.lat,
        lon: p.geometry?.location?.lng,
        displayName: p.description,
        type: p.types?.[0] || "unknown",
      }),
    );
  } catch {
    return geocodeNominatim(query);
  }
}

/**
 * Main geocoding function with fallback
 */
export async function geocode(
  query: string,
  options?: {
    provider?: "auto" | "nominatim" | "ola";
    limit?: number;
  },
): Promise<GeocodingResult[]> {
  const { provider = "auto", limit = 5 } = options || {};

  if (provider === "ola" || (provider === "auto" && env.OLA_MAPS_API_KEY)) {
    try {
      const results = await geocodeOlaMaps(query);
      if (results.length > 0) return results.slice(0, limit);
    } catch {
      // Fall through to Nominatim
    }
  }

  return geocodeNominatim(query, { limit });
}

/**
 * Reverse geocode with fallback
 */
export function reverseGeocode(
  lat: number,
  lon: number,
): Promise<ReverseGeocodingResult | null> {
  // Always use Nominatim for reverse geocoding (more reliable for India)
  return reverseGeocodeNominatim(lat, lon);
}

/**
 * Search for villages/districts in India using ISRO Bhuvan WFS
 * (Limited functionality without API key)
 */
export function searchBhuvanVillages(
  district: string,
  state: string,
): Array<{
  name: string;
  code: string;
  centroid?: { lat: number; lon: number };
}> {
  // Bhuvan WFS requires specific access
  // For now, return empty and use Nominatim as primary
  console.log(
    `[GEOCODE] Bhuvan village search for ${district}, ${state} - using Nominatim fallback`,
  );
  return [];
}
