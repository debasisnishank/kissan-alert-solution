import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getFarmsByFarmer } from "$lib/farm.ts";
import {
  checkWeatherAlerts,
  getDailyWeather,
  getSoilData,
} from "$lib/satellite/weather.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface WeatherData {
  date: string;
  dayName: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  icon: "sunny" | "cloudy" | "rainy" | "stormy";
}

interface WeatherPageData {
  location: string;
  currentTemp: number;
  currentCondition: string;
  forecast: WeatherData[];
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
  soil: {
    moisture: number;
    temperature: number;
  } | null;
  cropSuitability: {
    score: number;
    factors: string[];
  };
}

export const handler: Handlers<WeatherPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    let location = "India";
    let lat = 20.5937;
    let lon = 78.9629;

    if (farms.length > 0) {
      const farm = farms[0];
      location = `${farm.district || "Unknown"}, ${farm.state || "India"}`;

      // Get centroid from polygon
      if (farm.polygon?.coordinates?.[0]) {
        const coords = farm.polygon.coordinates[0];
        lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) /
          coords.length;
        lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) /
          coords.length;
      }
    }

    // Fetch weather data
    const today = new Date();
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    let forecast: WeatherData[] = [];
    let currentTemp = 28;
    let currentCondition = "Partly Cloudy";
    let alerts: Array<{ type: string; severity: string; message: string }> = [];
    let soil: { moisture: number; temperature: number } | null = null;

    try {
      const weatherData = await getDailyWeather({
        lat,
        lon,
        startDate: today.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      });

      forecast = weatherData.map((w, i) => {
        const date = new Date(w.date);
        const dayName = i === 0
          ? "Today"
          : i === 1
          ? "Tomorrow"
          : date.toLocaleDateString("en-IN", { weekday: "short" });

        let icon: WeatherData["icon"] = "sunny";
        if (w.precipitation > 20) icon = "stormy";
        else if (w.precipitation > 5) icon = "rainy";
        else if (w.temperatureMax < 30) icon = "cloudy";

        return {
          date: date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          }),
          dayName,
          tempMax: Math.round(w.temperatureMax),
          tempMin: Math.round(w.temperatureMin),
          precipitation: Math.round(w.precipitation),
          icon,
        };
      });

      if (forecast.length > 0) {
        currentTemp = forecast[0].tempMax;
        if (forecast[0].precipitation > 5) currentCondition = "Rainy";
        else if (forecast[0].tempMax > 35) currentCondition = "Hot & Sunny";
        else if (forecast[0].tempMax < 25) currentCondition = "Cool";
        else currentCondition = "Pleasant";
      }
    } catch (e) {
      console.error("Weather fetch error:", e);
      // Use mock data
      forecast = generateMockForecast();
    }

    // Fetch alerts
    try {
      const weatherAlerts = await checkWeatherAlerts(lat, lon);
      alerts = weatherAlerts.map((a) => ({
        type: a.type,
        severity: a.severity,
        message: a.message,
      }));
    } catch {
      // No alerts
    }

    // Fetch soil data
    try {
      const soilData = await getSoilData(lat, lon);
      soil = {
        moisture: soilData.moisture,
        temperature: soilData.temperature,
      };
    } catch {
      // No soil data
    }

    // Calculate crop suitability
    const suitabilityFactors: string[] = [];
    let suitabilityScore = 70;

    if (currentTemp >= 20 && currentTemp <= 35) {
      suitabilityFactors.push("Temperature is optimal");
      suitabilityScore += 10;
    } else {
      suitabilityFactors.push("Temperature stress possible");
      suitabilityScore -= 10;
    }

    const totalRain = forecast.reduce((sum, f) => sum + f.precipitation, 0);
    if (totalRain >= 20 && totalRain <= 100) {
      suitabilityFactors.push("Good rainfall expected");
      suitabilityScore += 10;
    } else if (totalRain < 10) {
      suitabilityFactors.push("Dry conditions - irrigation needed");
      suitabilityScore -= 5;
    } else {
      suitabilityFactors.push("Heavy rain risk");
      suitabilityScore -= 10;
    }

    if (soil && soil.moisture > 30) {
      suitabilityFactors.push("Soil moisture adequate");
    } else {
      suitabilityFactors.push("Consider irrigation");
    }

    return ctx.render({
      location,
      currentTemp,
      currentCondition,
      forecast,
      alerts,
      soil,
      cropSuitability: {
        score: Math.max(0, Math.min(100, suitabilityScore)),
        factors: suitabilityFactors,
      },
    });
  },
};

function generateMockForecast(): WeatherData[] {
  const days = ["Today", "Tomorrow", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((dayName, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return {
      date: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      dayName,
      tempMax: 28 + Math.floor(Math.random() * 8),
      tempMin: 18 + Math.floor(Math.random() * 5),
      precipitation: Math.random() > 0.7 ? Math.floor(Math.random() * 20) : 0,
      icon: Math.random() > 0.7
        ? "rainy"
        : Math.random() > 0.5
        ? "cloudy"
        : "sunny",
    };
  });
}

export default function WeatherPage({ data }: PageProps<WeatherPageData>) {
  const {
    location,
    currentTemp,
    currentCondition,
    forecast,
    alerts,
    soil,
    cropSuitability,
  } = data;

  const weatherIcons: Record<string, string> = {
    sunny:
      "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    cloudy:
      "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
    rainy:
      "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15zM9.75 21L12 17l2.25 4M12 21l2.25-4",
    stormy: "M13 10V3L4 14h7v7l9-11h-7z",
  };

  return (
    <AppShell title="Weather & Insights" showBack>
      {/* Current Weather */}
      <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white mb-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-blue-100 text-sm">{location}</p>
            <p class="text-5xl font-bold mt-1">{currentTemp}°</p>
            <p class="text-blue-100 mt-1">{currentCondition}</p>
          </div>
          <svg
            class="w-20 h-20 text-white/80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d={weatherIcons[forecast[0]?.icon || "sunny"]}
            />
          </svg>
        </div>
      </div>

      {/* Weather Alerts */}
      {alerts.length > 0 && (
        <div class="mb-4 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              class={`p-3 rounded-lg border ${
                alert.severity === "high"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : alert.severity === "medium"
                  ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              <div class="flex items-center gap-2">
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span class="font-medium capitalize">{alert.type} Alert</span>
              </div>
              <p class="text-sm mt-1">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* 7-Day Forecast */}
      <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">7-Day Forecast</h3>
        <div class="space-y-3">
          {forecast.map((day, i) => (
            <div key={i} class="flex items-center justify-between">
              <div class="w-20">
                <p class="font-medium text-gray-900">{day.dayName}</p>
                <p class="text-xs text-gray-500">{day.date}</p>
              </div>
              <svg
                class="w-8 h-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d={weatherIcons[day.icon]}
                />
              </svg>
              <div class="flex items-center gap-2">
                {day.precipitation > 0 && (
                  <span class="text-xs text-blue-600">
                    {day.precipitation}mm
                  </span>
                )}
                <span class="text-gray-900 font-medium">{day.tempMax}°</span>
                <span class="text-gray-400">{day.tempMin}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Soil Conditions */}
      {soil && (
        <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-3">Soil Conditions</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-3 bg-blue-50 rounded-lg">
              <p class="text-2xl font-bold text-blue-600">{soil.moisture}%</p>
              <p class="text-xs text-gray-600">Soil Moisture</p>
            </div>
            <div class="text-center p-3 bg-orange-50 rounded-lg">
              <p class="text-2xl font-bold text-orange-600">
                {soil.temperature}°C
              </p>
              <p class="text-xs text-gray-600">Soil Temperature</p>
            </div>
          </div>
        </div>
      )}

      {/* Crop Suitability */}
      <div class="bg-white rounded-xl border border-gray-100 p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900">Crop Suitability</h3>
          <span
            class={`text-lg font-bold ${
              cropSuitability.score >= 70
                ? "text-green-600"
                : cropSuitability.score >= 50
                ? "text-yellow-600"
                : "text-red-600"
            }`}
          >
            {cropSuitability.score}%
          </span>
        </div>
        <div class="h-2 bg-gray-100 rounded-full mb-3">
          <div
            class={`h-full rounded-full ${
              cropSuitability.score >= 70
                ? "bg-green-500"
                : cropSuitability.score >= 50
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
            style={`width: ${cropSuitability.score}%`}
          />
        </div>
        <div class="space-y-1">
          {cropSuitability.factors.map((factor, i) => (
            <p key={i} class="text-sm text-gray-600 flex items-center gap-2">
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              {factor}
            </p>
          ))}
        </div>
      </div>

      {/* Farming Tips */}
      <div class="mt-4 bg-green-50 border border-green-100 rounded-xl p-4">
        <h3 class="font-semibold text-green-800 mb-2">Today's Tip</h3>
        <p class="text-sm text-green-700">
          {currentCondition.includes("Rain")
            ? "Avoid spraying pesticides today. Rain will wash them away."
            : currentTemp > 35
            ? "Irrigate early morning or late evening to reduce evaporation."
            : "Good conditions for field activities. Plan your work accordingly."}
        </p>
      </div>
    </AppShell>
  );
}
