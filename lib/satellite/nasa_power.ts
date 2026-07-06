/**
 * NASA POWER (Prediction Of Worldwide Energy Resources) Integration
 * https://power.larc.nasa.gov/
 *
 * Free global meteorological and solar data
 * 30+ years of historical data, daily/monthly/climatology
 */

interface NASAPowerParams {
  lat: number;
  lon: number;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
  parameters?: PowerParameter[];
  community?: "AG" | "SB" | "RE"; // Agriculture, Buildings, Renewable Energy
}

type PowerParameter =
  | "T2M" // Temperature at 2m (°C)
  | "T2M_MAX" // Max temperature
  | "T2M_MIN" // Min temperature
  | "T2MDEW" // Dew point
  | "RH2M" // Relative humidity at 2m (%)
  | "PRECTOTCORR" // Precipitation (mm/day)
  | "WS2M" // Wind speed at 2m (m/s)
  | "WD2M" // Wind direction at 2m (degrees)
  | "ALLSKY_SFC_SW_DWN" // Solar radiation (MJ/m²/day)
  | "ALLSKY_SFC_PAR_TOT" // PAR (MJ/m²/day)
  | "GWETROOT" // Root zone soil wetness (0-1)
  | "GWETTOP" // Surface soil wetness (0-1)
  | "EVPTRNS" // Evapotranspiration (mm/day)
  | "PS" // Surface pressure (kPa)
  | "QV2M" // Specific humidity (g/kg)
  | "FROST_DAYS" // Frost days count
  | "T2M_RANGE" // Temperature range
  | "CLOUD_AMT"; // Cloud amount (%)

interface PowerDailyData {
  date: string;
  parameters: Record<PowerParameter, number>;
}

interface NASAPowerResult {
  lat: number;
  lon: number;
  data: PowerDailyData[];
  parameters: PowerParameter[];
  source: "nasa_power";
}

const POWER_API = "https://power.larc.nasa.gov/api/temporal/daily/point";

/**
 * Get daily meteorological data from NASA POWER
 */
export async function getNASAPowerDaily(
  params: NASAPowerParams,
): Promise<NASAPowerResult> {
  const {
    lat,
    lon,
    startDate,
    endDate,
    parameters = [
      "T2M",
      "T2M_MAX",
      "T2M_MIN",
      "RH2M",
      "PRECTOTCORR",
      "WS2M",
      "ALLSKY_SFC_SW_DWN",
      "GWETROOT",
      "GWETTOP",
    ],
    community = "AG",
  } = params;

  const paramStr = parameters.join(",");
  const url =
    `${POWER_API}?parameters=${paramStr}&community=${community}&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`NASA POWER API error: ${response.status}`);
    }

    const data = await response.json();
    const dailyData: PowerDailyData[] = [];

    // Parse response
    const props = data.properties?.parameter || {};
    const dates = Object.keys(props[parameters[0]] || {}).sort();

    for (const date of dates) {
      const paramValues: Record<string, number> = {};
      for (const param of parameters) {
        paramValues[param] = props[param]?.[date] ?? -999;
      }
      dailyData.push({
        date: formatPowerDate(date),
        parameters: paramValues as Record<PowerParameter, number>,
      });
    }

    return {
      lat,
      lon,
      data: dailyData,
      parameters,
      source: "nasa_power",
    };
  } catch (error) {
    console.error("[NASA POWER] API error:", error);
    return {
      lat,
      lon,
      data: [],
      parameters,
      source: "nasa_power",
    };
  }
}

function formatPowerDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${
    yyyymmdd.slice(6, 8)
  }`;
}

/**
 * Get agricultural summary for a farm location
 */
export async function getAgriWeatherSummary(
  lat: number,
  lon: number,
  days: number = 30,
): Promise<{
  avgTemp: number;
  maxTemp: number;
  minTemp: number;
  totalRainfall: number;
  avgHumidity: number;
  avgSolarRadiation: number;
  avgWindSpeed: number;
  rootZoneMoisture: number;
  surfaceMoisture: number;
  gdd: number; // Growing Degree Days
  frostRisk: boolean;
  source: string;
}> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const result = await getNASAPowerDaily({
    lat,
    lon,
    startDate: formatDateForPower(startDate),
    endDate: formatDateForPower(endDate),
    parameters: [
      "T2M",
      "T2M_MAX",
      "T2M_MIN",
      "RH2M",
      "PRECTOTCORR",
      "WS2M",
      "ALLSKY_SFC_SW_DWN",
      "GWETROOT",
      "GWETTOP",
    ],
    community: "AG",
  });

  if (result.data.length === 0) {
    return getDefaultAgriSummary();
  }

  const validData = result.data.filter(
    (d) => d.parameters.T2M !== -999,
  );

  const sum = (param: PowerParameter) =>
    validData.reduce((acc, d) => acc + (d.parameters[param] ?? 0), 0);
  const avg = (param: PowerParameter) =>
    validData.length > 0 ? sum(param) / validData.length : 0;
  const max = (param: PowerParameter) =>
    Math.max(...validData.map((d) => d.parameters[param] ?? -Infinity));
  const min = (param: PowerParameter) =>
    Math.min(
      ...validData.map((d) => d.parameters[param] ?? Infinity).filter((v) =>
        v !== -999
      ),
    );

  // Calculate GDD (base temperature 10°C for most crops)
  const gdd = validData.reduce((acc, d) => {
    const avgTemp = (d.parameters.T2M_MAX + d.parameters.T2M_MIN) / 2;
    return acc + Math.max(0, avgTemp - 10);
  }, 0);

  // Check frost risk (any day with min temp < 0)
  const frostRisk = validData.some((d) => d.parameters.T2M_MIN < 0);

  return {
    avgTemp: avg("T2M"),
    maxTemp: max("T2M_MAX"),
    minTemp: min("T2M_MIN"),
    totalRainfall: sum("PRECTOTCORR"),
    avgHumidity: avg("RH2M"),
    avgSolarRadiation: avg("ALLSKY_SFC_SW_DWN"),
    avgWindSpeed: avg("WS2M"),
    rootZoneMoisture: avg("GWETROOT") * 100, // Convert to %
    surfaceMoisture: avg("GWETTOP") * 100,
    gdd: Math.round(gdd),
    frostRisk,
    source: "NASA POWER",
  };
}

function formatDateForPower(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function getDefaultAgriSummary() {
  return {
    avgTemp: 25,
    maxTemp: 32,
    minTemp: 18,
    totalRainfall: 50,
    avgHumidity: 65,
    avgSolarRadiation: 18,
    avgWindSpeed: 2.5,
    rootZoneMoisture: 40,
    surfaceMoisture: 35,
    gdd: 450,
    frostRisk: false,
    source: "NASA POWER (fallback)",
  };
}

/**
 * Get climatology (long-term averages) for a location
 */
export async function getClimatology(
  lat: number,
  lon: number,
): Promise<{
  monthlyAvgTemp: number[];
  monthlyRainfall: number[];
  monthlyHumidity: number[];
  annualRainfall: number;
  growingSeasonLength: number;
  source: string;
}> {
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR,RH2M&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Climatology fetch failed");

    const data = await response.json();
    const props = data.properties?.parameter || {};

    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];

    const monthlyAvgTemp = months.map((m) => props.T2M?.[m] ?? 25);
    const monthlyRainfall = months.map((m) => props.PRECTOTCORR?.[m] ?? 50);
    const monthlyHumidity = months.map((m) => props.RH2M?.[m] ?? 65);

    // Growing season: months with avg temp > 10°C
    const growingSeasonLength = monthlyAvgTemp.filter((t) => t > 10).length;

    return {
      monthlyAvgTemp,
      monthlyRainfall,
      monthlyHumidity,
      annualRainfall: monthlyRainfall.reduce((a, b) => a + b, 0) * 30, // Approximate
      growingSeasonLength,
      source: "NASA POWER Climatology",
    };
  } catch (error) {
    console.error("[NASA POWER] Climatology error:", error);
    return {
      monthlyAvgTemp: Array(12).fill(25),
      monthlyRainfall: Array(12).fill(50),
      monthlyHumidity: Array(12).fill(65),
      annualRainfall: 1200,
      growingSeasonLength: 10,
      source: "NASA POWER (fallback)",
    };
  }
}

export type {
  NASAPowerParams,
  NASAPowerResult,
  PowerDailyData,
  PowerParameter,
};
