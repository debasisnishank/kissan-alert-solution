/**
 * Ola Maps Integration
 * https://maps.olacabs.com/
 *
 * Indian mapping service with:
 * - Geocoding & Reverse Geocoding
 * - Directions & Routing
 * - Places Search
 * - Static Maps
 * - Map Tiles (Vector & Raster)
 */

interface OlaGeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  address: {
    village?: string;
    district?: string;
    state?: string;
    pincode?: string;
    country: string;
  };
  confidence: number;
}

interface OlaPlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  category?: string;
  distance?: number;
}

interface OlaDirectionsResult {
  distance: number; // meters
  duration: number; // seconds
  polyline: string;
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
}

const OLA_API_BASE = "https://api.olamaps.io";

/**
 * Get Ola Maps API key from environment
 */
function getApiKey(): string {
  return Deno.env.get("OLA_MAPS_API_KEY") || "";
}

/**
 * Forward geocoding - address to coordinates
 */
export async function geocode(
  address: string,
): Promise<OlaGeocodingResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Ola Maps] No API key configured, using fallback");
    return geocodeFallback(address);
  }

  try {
    const url = `${OLA_API_BASE}/places/v1/geocode?address=${
      encodeURIComponent(address)
    }&api_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ola API error: ${response.status}`);

    const data = await response.json();
    const result = data.geocodingResults?.[0];

    if (!result) return null;

    return {
      lat: result.geometry.location.lat,
      lon: result.geometry.location.lng,
      displayName: result.formatted_address,
      address: {
        village: result.address_components?.find((c: { types: string[] }) =>
          c.types.includes("sublocality")
        )?.long_name,
        district: result.address_components?.find((c: { types: string[] }) =>
          c.types.includes("administrative_area_level_2")
        )?.long_name,
        state: result.address_components?.find((c: { types: string[] }) =>
          c.types.includes("administrative_area_level_1")
        )?.long_name,
        pincode: result.address_components?.find((c: { types: string[] }) =>
          c.types.includes("postal_code")
        )?.long_name,
        country: "India",
      },
      confidence: result.geometry.location_type === "ROOFTOP" ? 1 : 0.8,
    };
  } catch (error) {
    console.error("[Ola Maps] Geocode error:", error);
    return geocodeFallback(address);
  }
}

/**
 * Reverse geocoding - coordinates to address
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<OlaGeocodingResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return reverseGeocodeFallback(lat, lon);
  }

  try {
    const url =
      `${OLA_API_BASE}/places/v1/reverse-geocode?latlng=${lat},${lon}&api_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ola API error: ${response.status}`);

    const data = await response.json();
    const result = data.results?.[0];

    if (!result) return null;

    return {
      lat,
      lon,
      displayName: result.formatted_address,
      address: {
        village: extractAddressComponent(result, "sublocality"),
        district: extractAddressComponent(
          result,
          "administrative_area_level_2",
        ),
        state: extractAddressComponent(result, "administrative_area_level_1"),
        pincode: extractAddressComponent(result, "postal_code"),
        country: "India",
      },
      confidence: 0.9,
    };
  } catch (error) {
    console.error("[Ola Maps] Reverse geocode error:", error);
    return reverseGeocodeFallback(lat, lon);
  }
}

function extractAddressComponent(
  result: {
    address_components?: Array<{ types: string[]; long_name: string }>;
  },
  type: string,
): string | undefined {
  return result.address_components?.find((c) => c.types.includes(type))
    ?.long_name;
}

/**
 * Search for nearby places
 */
export async function searchNearbyPlaces(params: {
  lat: number;
  lon: number;
  query?: string;
  category?:
    | "agricultural_supply"
    | "bank"
    | "market"
    | "hospital"
    | "petrol_pump";
  radius?: number; // meters
  limit?: number;
}): Promise<OlaPlaceResult[]> {
  const { lat, lon, query, category, radius = 5000, limit = 10 } = params;
  const apiKey = getApiKey();

  if (!apiKey) {
    return searchNearbyFallback(params);
  }

  try {
    let url =
      `${OLA_API_BASE}/places/v1/nearbysearch?location=${lat},${lon}&radius=${radius}&api_key=${apiKey}`;

    if (query) url += `&keyword=${encodeURIComponent(query)}`;
    if (category) url += `&type=${category}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ola API error: ${response.status}`);

    const data = await response.json();

    return (data.predictions || []).slice(0, limit).map(
      (p: Record<string, unknown>) => ({
        placeId: p.place_id as string,
        name: p.structured_formatting?.main_text as string ||
          p.description as string,
        address: p.structured_formatting?.secondary_text as string || "",
        lat: p.geometry?.location?.lat as number || lat,
        lon: p.geometry?.location?.lng as number || lon,
        category: p.types?.[0] as string,
        distance: p.distance_meters as number,
      }),
    );
  } catch (error) {
    console.error("[Ola Maps] Nearby search error:", error);
    return searchNearbyFallback(params);
  }
}

/**
 * Get directions between two points
 */
export async function getDirections(params: {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  mode?: "driving" | "walking" | "bicycling";
}): Promise<OlaDirectionsResult | null> {
  const { originLat, originLon, destLat, destLon, mode = "driving" } = params;
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDirectionsFallback(params);
  }

  try {
    const url =
      `${OLA_API_BASE}/routing/v1/directions?origin=${originLat},${originLon}&destination=${destLat},${destLon}&mode=${mode}&api_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ola API error: ${response.status}`);

    const data = await response.json();
    const route = data.routes?.[0];

    if (!route) return null;

    return {
      distance: route.legs?.[0]?.distance?.value || 0,
      duration: route.legs?.[0]?.duration?.value || 0,
      polyline: route.overview_polyline?.points || "",
      steps: (route.legs?.[0]?.steps || []).map(
        (s: Record<string, unknown>) => ({
          instruction:
            (s.html_instructions as string)?.replace(/<[^>]*>/g, "") || "",
          distance: (s.distance as { value: number })?.value || 0,
          duration: (s.duration as { value: number })?.value || 0,
        }),
      ),
    };
  } catch (error) {
    console.error("[Ola Maps] Directions error:", error);
    return getDirectionsFallback(params);
  }
}

/**
 * Get static map image URL
 */
export function getStaticMapUrl(params: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  markers?: Array<{ lat: number; lon: number; color?: string }>;
}): string {
  const { lat, lon, zoom = 15, width = 400, height = 300, markers = [] } =
    params;
  const apiKey = getApiKey();

  if (!apiKey) {
    // Fallback to OpenStreetMap static
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=${width}x${height}&maptype=osmarenderer`;
  }

  let url =
    `${OLA_API_BASE}/tiles/v1/styles/default/static/${lon},${lat},${zoom}/${width}x${height}.png?api_key=${apiKey}`;

  if (markers.length > 0) {
    const markerStr = markers
      .map((m) => `${m.lon},${m.lat}`)
      .join("|");
    url += `&markers=${markerStr}`;
  }

  return url;
}

/**
 * Get tile URL template for Leaflet
 */
export function getOlaTileUrl(): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    // Fallback to OSM
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }
  return `${OLA_API_BASE}/tiles/v1/styles/default/{z}/{x}/{y}.png?api_key=${apiKey}`;
}

// Fallback functions using free alternatives

async function geocodeFallback(
  address: string,
): Promise<OlaGeocodingResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${
      encodeURIComponent(address)
    }&format=json&limit=1&countrycodes=in`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Compass/1.0" },
    });
    const data = await response.json();
    const result = data[0];
    if (!result) return null;

    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      address: {
        village: result.address?.village,
        district: result.address?.county || result.address?.state_district,
        state: result.address?.state,
        pincode: result.address?.postcode,
        country: "India",
      },
      confidence: 0.7,
    };
  } catch {
    return null;
  }
}

async function reverseGeocodeFallback(
  lat: number,
  lon: number,
): Promise<OlaGeocodingResult | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Compass/1.0" },
    });
    const result = await response.json();

    return {
      lat,
      lon,
      displayName: result.display_name,
      address: {
        village: result.address?.village,
        district: result.address?.county || result.address?.state_district,
        state: result.address?.state,
        pincode: result.address?.postcode,
        country: "India",
      },
      confidence: 0.7,
    };
  } catch {
    return null;
  }
}

function searchNearbyFallback(params: {
  lat: number;
  lon: number;
  category?: string;
}): OlaPlaceResult[] {
  // Return mock data for demo purposes
  const { lat, lon, category } = params;
  const mockPlaces: Record<string, OlaPlaceResult[]> = {
    agricultural_supply: [
      {
        placeId: "demo1",
        name: "Krishi Seva Kendra",
        address: "Near Main Road",
        lat: lat + 0.01,
        lon: lon + 0.01,
        category: "agricultural_supply",
        distance: 1200,
      },
      {
        placeId: "demo2",
        name: "Farmers Supply Store",
        address: "Market Area",
        lat: lat - 0.01,
        lon: lon + 0.02,
        category: "agricultural_supply",
        distance: 2500,
      },
    ],
    bank: [
      {
        placeId: "demo3",
        name: "State Bank of India",
        address: "Town Center",
        lat: lat + 0.005,
        lon: lon - 0.01,
        category: "bank",
        distance: 800,
      },
    ],
    market: [
      {
        placeId: "demo4",
        name: "Agricultural Produce Market",
        address: "APMC Yard",
        lat: lat - 0.02,
        lon: lon - 0.01,
        category: "market",
        distance: 3000,
      },
    ],
  };

  return mockPlaces[category || "agricultural_supply"] || [];
}

function getDirectionsFallback(params: {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
}): OlaDirectionsResult {
  const { originLat, originLon, destLat, destLon } = params;
  // Approximate distance using Haversine
  const R = 6371000; // Earth radius in meters
  const dLat = ((destLat - originLat) * Math.PI) / 180;
  const dLon = ((destLon - originLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((originLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return {
    distance: Math.round(distance),
    duration: Math.round(distance / 10), // Assume 36 km/h average
    polyline: "",
    steps: [],
  };
}

export type { OlaDirectionsResult, OlaGeocodingResult, OlaPlaceResult };
