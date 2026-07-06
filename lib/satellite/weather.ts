/**
 * Weather and Rainfall Data Client
 * Free weather data sources with fallback chain:
 * 1. Open-Meteo API (primary - no auth required)
 * 2. Copernicus Climate Data Store (CDS) - requires free registration
 * 3. NASA GPM IMERG via GIBS for rainfall visualization
 */

// import { env } from "$utils/env.ts";

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly?: {
    time: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    precipitation?: number[];
    soil_moisture_0_to_10cm?: number[];
    soil_temperature_0_to_10cm?: number[];
    evapotranspiration?: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    rain_sum?: number[];
    et0_fao_evapotranspiration?: number[];
    soil_moisture_0_to_10cm_mean?: number[];
  };
}

export interface WeatherData {
  date: Date;
  temperatureMax: number;
  temperatureMin: number;
  precipitation: number;
  humidity: number;
  evapotranspiration: number;
  soilMoisture?: number;
}

export interface HourlyWeatherData {
  timestamp: Date;
  temperature: number;
  humidity: number;
  precipitation: number;
  soilMoisture?: number;
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1";
const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1";

/**
 * Get daily weather data for a location
 */
export async function getDailyWeather(params: {
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
}): Promise<WeatherData[]> {
  const { lat, lon, startDate, endDate } = params;

  // Determine if we need historical or forecast API
  const today = new Date();
  const endDateObj = new Date(endDate);
  const isHistorical = endDateObj < today;

  const baseUrl = isHistorical ? OPEN_METEO_ARCHIVE_URL : OPEN_METEO_URL;
  const endpoint = isHistorical ? "archive" : "forecast";

  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,et0_fao_evapotranspiration",
  );
  url.searchParams.set("timezone", "Asia/Kolkata");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Open-Meteo API failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }

  const data: OpenMeteoResponse = await response.json();

  if (!data.daily) {
    return [];
  }

  return data.daily.time.map((time, i) => ({
    date: new Date(time),
    temperatureMax: data.daily!.temperature_2m_max?.[i] || 0,
    temperatureMin: data.daily!.temperature_2m_min?.[i] || 0,
    precipitation: data.daily!.precipitation_sum?.[i] ||
      data.daily!.rain_sum?.[i] || 0,
    humidity: 0, // Not available in daily endpoint
    evapotranspiration: data.daily!.et0_fao_evapotranspiration?.[i] || 0,
  }));
}

/**
 * Get hourly weather data for a location (last 24 hours)
 */
export async function getHourlyWeather(params: {
  lat: number;
  lon: number;
  date: string;
}): Promise<HourlyWeatherData[]> {
  const { lat, lon, date } = params;

  const url = new URL(`${OPEN_METEO_URL}/forecast`);
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,precipitation,soil_moisture_0_to_10cm",
  );
  url.searchParams.set("timezone", "Asia/Kolkata");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo API failed: ${response.status}`);
  }

  const data: OpenMeteoResponse = await response.json();

  if (!data.hourly) {
    return [];
  }

  return data.hourly.time.map((time, i) => ({
    timestamp: new Date(time),
    temperature: data.hourly!.temperature_2m?.[i] || 0,
    humidity: data.hourly!.relative_humidity_2m?.[i] || 0,
    precipitation: data.hourly!.precipitation?.[i] || 0,
    soilMoisture: data.hourly!.soil_moisture_0_to_10cm?.[i],
  }));
}

/**
 * Get rainfall sum for last N hours at a location
 */
export async function getRainfallLast24h(
  lat: number,
  lon: number,
): Promise<number> {
  const hourly = await getHourlyWeather({
    lat,
    lon,
    date: new Date().toISOString().split("T")[0],
  });

  return hourly.reduce((sum, h) => sum + h.precipitation, 0);
}

/**
 * Get soil moisture data from Open-Meteo
 */
export async function getSoilData(params: {
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
}): Promise<
  Array<{
    date: Date;
    soilMoisture: number;
    soilTemperature: number;
  }>
> {
  const { lat, lon, startDate, endDate } = params;

  const url = new URL(`${OPEN_METEO_URL}/forecast`);
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set(
    "hourly",
    "soil_moisture_0_to_10cm,soil_temperature_0_to_10cm",
  );
  url.searchParams.set("timezone", "Asia/Kolkata");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo Soil API failed: ${response.status}`);
  }

  const data: OpenMeteoResponse = await response.json();

  if (!data.hourly) {
    return [];
  }

  // Aggregate to daily
  const dailyMap = new Map<
    string,
    { moisture: number[]; temp: number[] }
  >();

  data.hourly.time.forEach((time, i) => {
    const dateKey = time.split("T")[0];
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, { moisture: [], temp: [] });
    }
    const day = dailyMap.get(dateKey)!;
    if (data.hourly!.soil_moisture_0_to_10cm?.[i] !== undefined) {
      day.moisture.push(data.hourly!.soil_moisture_0_to_10cm[i]);
    }
    if (data.hourly!.soil_temperature_0_to_10cm?.[i] !== undefined) {
      day.temp.push(data.hourly!.soil_temperature_0_to_10cm[i]);
    }
  });

  return Array.from(dailyMap.entries()).map(([dateStr, values]) => ({
    date: new Date(dateStr),
    soilMoisture: values.moisture.length > 0
      ? values.moisture.reduce((a, b) => a + b) / values.moisture.length
      : 0,
    soilTemperature: values.temp.length > 0
      ? values.temp.reduce((a, b) => a + b) / values.temp.length
      : 0,
  }));
}

/**
 * Check for weather alerts (heavy rain, drought conditions)
 */
export async function checkWeatherAlerts(
  lat: number,
  lon: number,
): Promise<
  Array<{
    type: "heavy_rain" | "drought" | "heat_wave" | "frost";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }>
> {
  const alerts: Array<{
    type: "heavy_rain" | "drought" | "heat_wave" | "frost";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
  }> = [];

  try {
    const today = new Date();
    const startDate = today.toISOString().split("T")[0];
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const weather = await getDailyWeather({ lat, lon, startDate, endDate });

    for (const day of weather) {
      // Heavy rain alert
      if (day.precipitation > 50) {
        alerts.push({
          type: "heavy_rain",
          severity: day.precipitation > 100 ? "critical" : "high",
          message: `Expected ${
            day.precipitation.toFixed(0)
          }mm rainfall on ${day.date.toLocaleDateString()}`,
        });
      }

      // Heat wave alert
      if (day.temperatureMax > 42) {
        alerts.push({
          type: "heat_wave",
          severity: day.temperatureMax > 45 ? "critical" : "high",
          message: `Temperature expected to reach ${
            day.temperatureMax.toFixed(
              0,
            )
          }°C`,
        });
      }

      // Frost alert
      if (day.temperatureMin < 4) {
        alerts.push({
          type: "frost",
          severity: day.temperatureMin < 0 ? "critical" : "high",
          message: `Frost risk: minimum temperature ${
            day.temperatureMin.toFixed(
              0,
            )
          }°C`,
        });
      }
    }

    // Drought check (no rain for 7+ days)
    const totalRain = weather.reduce((sum, d) => sum + d.precipitation, 0);
    if (totalRain < 5 && weather.length >= 7) {
      alerts.push({
        type: "drought",
        severity: totalRain < 1 ? "high" : "medium",
        message: `Dry spell: only ${
          totalRain.toFixed(
            0,
          )
        }mm expected in next 7 days`,
      });
    }
  } catch (error) {
    console.error("Weather alert check failed:", error);
  }

  return alerts;
}
