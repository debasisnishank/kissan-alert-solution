/**
 * UPAg (Unified Portal for Agricultural Statistics) Integration
 * Government of India - Ministry of Agriculture
 * https://upag.gov.in/
 *
 * Provides: Crop yields, market prices, agricultural statistics
 * API: https://data.upag.gov.in/
 */

const UPAG_API_BASE = "https://data.upag.gov.in/v1/upag/api-data-share";

// Cache for access token
let accessToken: string | null = null;
let tokenExpiry: Date | null = null;

export interface UPAgCredentials {
  username: string;
  password: string;
}

export interface UPAgCropData {
  stateName: string;
  district?: string;
  cropYear: string;
  crop: string;
  season: "kharif" | "rabi" | "summer" | "whole_year";
  area: number; // hectares
  areaUnit: string;
  yield: number; // kg/ha
  yieldUnit: string;
  production: number; // tonnes
  productionUnit: string;
}

export interface UPAgMarketPrice {
  commodity: string;
  state: string;
  market: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  arrivalDate: string;
}

export interface UPAgSoilData {
  state: string;
  district?: string;
  soilType: string;
  ph: number;
  organicCarbon: number; // %
  nitrogenStatus: "Low" | "Medium" | "High";
  phosphorusStatus: "Low" | "Medium" | "High";
  potassiumStatus: "Low" | "Medium" | "High";
  source: string;
}

/**
 * Get access token from UPAg API
 */
async function getAccessToken(
  credentials: UPAgCredentials,
): Promise<string | null> {
  // Check if we have a valid cached token
  if (accessToken && tokenExpiry && new Date() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await fetch(`${UPAG_API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: credentials.username,
        password: credentials.password,
        scope: "",
      }),
    });

    if (!response.ok) {
      console.error("[UPAg] Login failed:", response.status);
      return null;
    }

    const data = await response.json();
    accessToken = data.access_token;
    // Token typically valid for 1 hour
    tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
    return accessToken;
  } catch (error) {
    console.error("[UPAg] Login error:", error);
    return null;
  }
}

/**
 * Get crop statistics from DAFW (State level)
 */
export async function getCropStatistics(params: {
  credentials: UPAgCredentials;
  state?: string;
  year?: string[];
  season?: ("kharif" | "rabi" | "summer" | "whole_year")[];
  crop?: string;
  limit?: number;
}): Promise<UPAgCropData[]> {
  const token = await getAccessToken(params.credentials);
  if (!token) return [];

  try {
    const response = await fetch(`${UPAG_API_BASE}/sources/dafw_state`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_input_object: {
          source_name: "dafw_state",
          limit: params.limit || 100,
          offset: 0,
          year: params.year || [new Date().getFullYear().toString()],
          season: params.season || ["kharif", "rabi"],
          location_granularity: "state",
          state: params.state ? [params.state] : undefined,
          crop: params.crop ? [params.crop] : undefined,
        },
      }),
    });

    if (!response.ok) {
      console.error("[UPAg] Crop stats failed:", response.status);
      return [];
    }

    const data = await response.json();
    if (data.status !== "Success" || !data.data) return [];

    return data.data.map(
      (item: Record<string, unknown>): UPAgCropData => ({
        stateName: String(item.StateName || item.State || ""),
        district: item.District ? String(item.District) : undefined,
        cropYear: String(item.CropYear || item.Year || ""),
        crop: String(item.Crop || ""),
        season: String(item.Season || "kharif")
          .toLowerCase() as UPAgCropData["season"],
        area: Number(item.CropArea || item.Area || 0),
        areaUnit: String(item.CropAreaUOM || "Ha"),
        yield: Number(item.CropYield || item.Yield || 0),
        yieldUnit: String(item.CropYieldUOM || "Kg/Ha"),
        production: Number(item.CropProduction || item.Production || 0),
        productionUnit: String(item.CropProductionUOM || "Tonnes"),
      }),
    );
  } catch (error) {
    console.error("[UPAg] Crop stats error:", error);
    return [];
  }
}

/**
 * Get market prices from Agmarknet
 */
export async function getMarketPrices(params: {
  credentials: UPAgCredentials;
  commodity?: string;
  state?: string;
  market?: string;
  limit?: number;
}): Promise<UPAgMarketPrice[]> {
  const token = await getAccessToken(params.credentials);
  if (!token) return [];

  try {
    const response = await fetch(`${UPAG_API_BASE}/sources/agmarknet`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_input_object: {
          source_name: "agmarknet",
          limit: params.limit || 50,
          offset: 0,
          commodity: params.commodity ? [params.commodity] : undefined,
          state: params.state ? [params.state] : undefined,
          market: params.market ? [params.market] : undefined,
        },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.status !== "Success" || !data.data) return [];

    return data.data.map(
      (item: Record<string, unknown>): UPAgMarketPrice => ({
        commodity: String(item.Commodity || item.commodity || ""),
        state: String(item.State || item.state || ""),
        market: String(item.Market || item.market || ""),
        minPrice: Number(item.Min_Price || item.minPrice || 0),
        maxPrice: Number(item.Max_Price || item.maxPrice || 0),
        modalPrice: Number(item.Modal_Price || item.modalPrice || 0),
        arrivalDate: String(item.Arrival_Date || item.date || ""),
      }),
    );
  } catch (error) {
    console.error("[UPAg] Market prices error:", error);
    return [];
  }
}

/**
 * Get district-level crop data from DAFW
 */
export async function getDistrictCropData(params: {
  credentials: UPAgCredentials;
  state: string;
  district?: string;
  year?: string[];
  season?: string[];
  limit?: number;
}): Promise<UPAgCropData[]> {
  const token = await getAccessToken(params.credentials);
  if (!token) return [];

  try {
    const response = await fetch(`${UPAG_API_BASE}/sources/dafw_district`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_input_object: {
          source_name: "dafw_district",
          limit: params.limit || 100,
          offset: 0,
          year: params.year || [new Date().getFullYear().toString()],
          season: params.season || ["kharif", "rabi"],
          location_granularity: "district",
          state: [params.state],
          district: params.district ? [params.district] : undefined,
        },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.status !== "Success" || !data.data) return [];

    return data.data.map(
      (item: Record<string, unknown>): UPAgCropData => ({
        stateName: String(item.StateName || item.State || ""),
        district: String(item.DistrictName || item.District || ""),
        cropYear: String(item.CropYear || item.Year || ""),
        crop: String(item.Crop || ""),
        season: String(item.Season || "kharif")
          .toLowerCase() as UPAgCropData["season"],
        area: Number(item.CropArea || item.Area || 0),
        areaUnit: String(item.CropAreaUOM || "Ha"),
        yield: Number(item.CropYield || item.Yield || 0),
        yieldUnit: String(item.CropYieldUOM || "Kg/Ha"),
        production: Number(item.CropProduction || item.Production || 0),
        productionUnit: String(item.CropProductionUOM || "Tonnes"),
      }),
    );
  } catch (error) {
    console.error("[UPAg] District data error:", error);
    return [];
  }
}

/**
 * Get MNCFC (FASAL) crop yield forecasts
 */
export async function getMNCFCForecast(params: {
  credentials: UPAgCredentials;
  state?: string;
  crop?: string;
  year?: string;
  season?: string;
  limit?: number;
}): Promise<UPAgCropData[]> {
  const token = await getAccessToken(params.credentials);
  if (!token) return [];

  try {
    const response = await fetch(`${UPAG_API_BASE}/sources/mncfc`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_input_object: {
          source_name: "mncfc",
          limit: params.limit || 50,
          offset: 0,
          state: params.state ? [params.state] : undefined,
          crop: params.crop ? [params.crop] : undefined,
          year: params.year,
          season: params.season ? [params.season] : undefined,
        },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.status !== "Success" || !data.data) return [];

    return data.data.map(
      (item: Record<string, unknown>): UPAgCropData => ({
        stateName: String(item.StateName || ""),
        cropYear: String(item.CropYear || ""),
        crop: String(item.Crop || ""),
        season: String(item.Season || "")
          .toLowerCase() as UPAgCropData["season"],
        area: Number(item.CropArea || 0),
        areaUnit: String(item.CropAreaUOM || "Ha"),
        yield: Number(item.CropYield || 0),
        yieldUnit: String(item.CropYieldUOM || "Kg/Ha"),
        production: Number(item.CropProduction || 0),
        productionUnit: String(item.CropProductionUOM || "Tonnes"),
      }),
    );
  } catch (error) {
    console.error("[UPAg] MNCFC forecast error:", error);
    return [];
  }
}

// Export types
export type { UPAgCredentials };
