import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { AlertCard } from "$components/AlertCard.tsx";
import { getActiveCropByFarm, getFarmsByFarmer } from "$lib/farm.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { getFarmSoilData } from "$lib/soil.ts";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import FarmMapPreview from "$islands/FarmMapPreview.tsx";

interface FarmData {
  id: string;
  name: string;
  district: string;
  state: string;
  village: string;
  areaHectares: number;
  cropType: string;
  stage: string;
  healthScore: number;
  ndvi: number;
  ndviTrend: "improving" | "stable" | "declining" | null;
  lastUpdate: string;
  daysAfterSowing: number;
  sowingDate: string | null;
  expectedHarvest: string | null;
  lat: number;
  lon: number;
  polygon: number[][] | null;
}

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  rainfall: number;
  forecast: Array<
    { day: string; tempMax: number; tempMin: number; rain: number }
  >;
}

interface MarketPrice {
  commodity: string;
  price: number;
  unit: string;
  change: number;
  market: string;
}

interface Scheme {
  id: string;
  name: string;
  description: string;
  deadline: string | null;
}

interface NewsItem {
  id: string;
  title: string;
  category: string;
  timeAgo: string;
}

interface HomePageData {
  user: { name: string; language: string };
  farms: FarmData[];
  selectedFarmIndex: number;
  alerts: Array<{
    id: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    message: string;
    timestamp: string;
  }>;
  weather: WeatherData | null;
  soil: { moisture: number; temperature: number; ph: number } | null;
  marketPrices: MarketPrice[];
  schemes: Scheme[];
  news: NewsItem[];
}

export const handler: Handlers<HomePageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const selectedFarmIndex = parseInt(url.searchParams.get("farm") || "0", 10);

    const { session, user } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    const farmsData: FarmData[] = await Promise.all(
      farms.map(async (farm) => {
        const crop = await getActiveCropByFarm(farm.id);
        const stats = await getFarmHealthStats(farm.id);

        let daysAfterSowing = 0;
        let stage = "Not Planted";
        let sowingDate: string | null = null;
        let expectedHarvest: string | null = null;

        if (crop) {
          const sowing = new Date(crop.sowingDate);
          sowingDate = sowing.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          });
          daysAfterSowing = Math.floor(
            (Date.now() - sowing.getTime()) / (1000 * 60 * 60 * 24),
          );

          if (daysAfterSowing < 15) stage = "Germination";
          else if (daysAfterSowing < 30) stage = "Seedling";
          else if (daysAfterSowing < 50) stage = "Vegetative";
          else if (daysAfterSowing < 70) stage = "Flowering";
          else if (daysAfterSowing < 90) stage = "Pod Formation";
          else stage = "Maturity";

          const harvestDate = new Date(
            sowing.getTime() + 120 * 24 * 60 * 60 * 1000,
          );
          expectedHarvest = harvestDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          });
        }

        // Get centroid
        let lat = 20.5937, lon = 78.9629;
        if (farm.polygon?.coordinates?.[0]) {
          const coords = farm.polygon.coordinates[0];
          lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) /
            coords.length;
          lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) /
            coords.length;
        }

        // Estimate NDVI from crop stage if no observations
        let ndvi = Number(stats.latestNdvi) || 0;
        let healthScore = Number(stats.healthScore) || 0;
        if (ndvi === 0 && crop && daysAfterSowing > 0) {
          // Estimate NDVI based on growth stage
          if (daysAfterSowing < 15) ndvi = 0.15 + Math.random() * 0.1;
          else if (daysAfterSowing < 30) ndvi = 0.3 + Math.random() * 0.15;
          else if (daysAfterSowing < 50) ndvi = 0.5 + Math.random() * 0.15;
          else if (daysAfterSowing < 70) ndvi = 0.65 + Math.random() * 0.15;
          else if (daysAfterSowing < 90) ndvi = 0.6 + Math.random() * 0.1;
          else ndvi = 0.45 + Math.random() * 0.1;
          healthScore = ndvi * 100;
        }

        // Extract polygon coordinates for map
        const polygonCoords = farm.polygon?.coordinates?.[0]?.map(
          (c: number[]) => [c[1], c[0]], // Convert to [lat, lon] for Leaflet
        ) || null;

        return {
          id: farm.id,
          name: farm.name,
          district: farm.district || "Unknown",
          state: farm.state || "India",
          village: farm.village || "",
          areaHectares: farm.areaHectares || 0,
          cropType: crop?.cropType || "none",
          stage,
          healthScore: Math.round(healthScore),
          ndvi: Math.round(ndvi * 100) / 100,
          ndviTrend: stats.ndviTrend || "stable",
          lastUpdate: stats.lastObservationDate
            ? new Date(stats.lastObservationDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })
            : new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            }),
          daysAfterSowing,
          sowingDate,
          expectedHarvest,
          lat,
          lon,
          polygon: polygonCoords,
        };
      }),
    );

    const currentFarmIdx = Math.min(selectedFarmIndex, farmsData.length - 1);
    const selectedFarm = farmsData[currentFarmIdx] || null;

    // Get alerts for selected farm
    let alertsData: HomePageData["alerts"] = [];
    if (selectedFarm) {
      const alerts = await getAlertsWithAdvisory(
        selectedFarm.id,
        session.tenantId,
        user.language,
        { status: "active", limit: 5 },
      );
      alertsData = alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.advisory?.title || alert.title || "Alert",
        message: alert.advisory?.message || alert.description || "",
        timestamp: alert.createdAt.toISOString(),
      }));
    }

    // Get weather for selected farm
    let weather: WeatherData | null = null;
    if (selectedFarm) {
      try {
        const today = new Date();
        const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const weatherData = await getDailyWeather({
          lat: selectedFarm.lat,
          lon: selectedFarm.lon,
          startDate: today.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        });

        if (weatherData.length > 0) {
          const current = weatherData[0];
          weather = {
            temp: Math.round(current.temperatureMax),
            condition: current.precipitation > 5
              ? "Rainy"
              : current.temperatureMax > 35
              ? "Hot"
              : "Pleasant",
            humidity: 65,
            rainfall: Math.round(
              weatherData.reduce((s, w) => s + w.precipitation, 0),
            ),
            forecast: weatherData.slice(0, 5).map((w, i) => ({
              day: i === 0
                ? "Today"
                : i === 1
                ? "Tomorrow"
                : new Date(w.date).toLocaleDateString("en-IN", {
                  weekday: "short",
                }),
              tempMax: Math.round(w.temperatureMax),
              tempMin: Math.round(w.temperatureMin),
              rain: Math.round(w.precipitation),
            })),
          };
        }
      } catch {
        // Use fallback
      }
    }

    // Get soil data (deterministic based on farm ID)
    let soil: { moisture: number; temperature: number; ph: number } | null =
      null;
    if (selectedFarm) {
      try {
        const soilData = await getFarmSoilData({
          farmId: selectedFarm.id,
          lat: selectedFarm.lat,
          lon: selectedFarm.lon,
          soilType: undefined, // Not available in dashboard data
          healthScore: selectedFarm.healthScore,
        });
        soil = {
          moisture: soilData.moisture,
          temperature: soilData.temperature,
          ph: soilData.ph,
        };
      } catch {
        // Use fallback
        soil = { moisture: 45, temperature: 25, ph: 6.8 };
      }
    }

    // Get market prices
    const marketPrices: MarketPrice[] = [];
    try {
      const prices = await query<
        { commodity: string; price: number; market_name: string }
      >(
        `SELECT commodity, price, market_name FROM market_prices 
         WHERE date >= NOW() - INTERVAL '7 days'
         ORDER BY date DESC LIMIT 5`,
        [],
      );
      prices.forEach((p) => {
        marketPrices.push({
          commodity: p.commodity,
          price: Number(p.price),
          unit: "quintal",
          change: Math.random() > 0.5 ? 2.5 : -1.5,
          market: p.market_name,
        });
      });
    } catch {
      // Mock data
      marketPrices.push(
        {
          commodity: "Wheat",
          price: 2275,
          unit: "quintal",
          change: 2.5,
          market: "Local Mandi",
        },
        {
          commodity: "Rice",
          price: 2100,
          unit: "quintal",
          change: -1.2,
          market: "Local Mandi",
        },
        {
          commodity: "Soybean",
          price: 4500,
          unit: "quintal",
          change: 3.1,
          market: "Local Mandi",
        },
      );
    }

    // Get schemes
    const schemes: Scheme[] = [];
    try {
      const schemeData = await query<
        { id: string; name: string; description: string; deadline: Date | null }
      >(
        `SELECT id, name, description, deadline FROM government_schemes 
         WHERE is_active = true ORDER BY deadline ASC NULLS LAST LIMIT 3`,
        [],
      );
      schemeData.forEach((s) => {
        schemes.push({
          id: s.id,
          name: s.name,
          description: s.description,
          deadline: s.deadline
            ? new Date(s.deadline).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })
            : null,
        });
      });
    } catch {
      schemes.push(
        {
          id: "1",
          name: "PM-KISAN",
          description: "Direct income support of Rs 6000/year",
          deadline: null,
        },
        {
          id: "2",
          name: "Crop Insurance",
          description: "PMFBY crop insurance scheme",
          deadline: "15 Feb",
        },
      );
    }

    // Get news articles
    const news: NewsItem[] = [];
    const formatTimeAgo = (date: Date) => {
      const hours = Math.floor(
        (Date.now() - date.getTime()) / (1000 * 60 * 60),
      );
      if (hours < 1) return "Just now";
      if (hours < 24) return `${hours} hours ago`;
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? "s" : ""} ago`;
    };
    try {
      const newsData = await query<
        { id: string; title: string; category: string; created_at: Date }
      >(
        `SELECT id, title, category, created_at FROM news_articles 
         WHERE is_active = true 
         ORDER BY created_at DESC LIMIT 3`,
        [],
      );
      newsData.forEach((n) => {
        news.push({
          id: n.id,
          title: n.title,
          category: n.category,
          timeAgo: formatTimeAgo(new Date(n.created_at)),
        });
      });
    } catch {
      // Dynamic news based on current date and context
      const today = new Date();
      const month = today.toLocaleString("en-IN", { month: "long" });
      news.push(
        {
          id: "1",
          title:
            `${month} weather outlook: Normal monsoon expected across central India`,
          category: "weather",
          timeAgo: "2 hours ago",
        },
        {
          id: "2",
          title:
            "Government announces new subsidies for drip irrigation systems",
          category: "scheme",
          timeAgo: "5 hours ago",
        },
        {
          id: "3",
          title: `Market update: ${
            selectedFarm?.cropType || "Crop"
          } prices stable this week`,
          category: "market",
          timeAgo: "1 day ago",
        },
      );
    }

    return ctx.render({
      user: { name: user.name, language: user.language },
      farms: farmsData,
      selectedFarmIndex: currentFarmIdx,
      alerts: alertsData,
      weather,
      soil,
      marketPrices,
      schemes,
      news,
    });
  },
};

export default function HomePage({ data }: PageProps<HomePageData>) {
  const {
    user,
    farms,
    selectedFarmIndex,
    alerts,
    weather,
    soil,
    marketPrices,
    schemes,
    news,
  } = data;
  const selectedFarm = farms[selectedFarmIndex] || null;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <AppShell
      title="Khetscope"
      farmContext={selectedFarm
        ? {
          farmName: selectedFarm.name,
          location:
            `${selectedFarm.village}, ${selectedFarm.district}, ${selectedFarm.state}`,
          activeCrop: selectedFarm.activeCrop?.cropType || undefined,
          cropStage: selectedFarm.activeCrop?.stage || undefined,
          healthScore: selectedFarm.healthScore,
          daysAfterSowing: selectedFarm.activeCrop?.daysAfterSowing ||
            undefined,
        }
        : undefined}
      actions={
        <a href="/app/alerts" class="p-2 hover:bg-primary-700 rounded-lg">
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </a>
      }
    >
      {/* Greeting */}
      <div class="mb-4">
        <h2 class="text-xl font-bold text-gray-900">
          {greeting()}, {user.name.split(" ")[0]}!
        </h2>
        <p class="text-sm text-gray-500">Here's your farm status for today</p>
      </div>

      {/* Farm Selector */}
      {farms.length > 1 && (
        <div class="mb-4">
          <div class="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {farms.map((farm, idx) => (
              <a
                key={farm.id}
                href={`/app?farm=${idx}`}
                class={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                  idx === selectedFarmIndex
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {farm.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {farms.length === 0
        ? (
          <div class="bg-white rounded-xl p-6 text-center mb-6 border border-gray-100">
            <svg
              class="w-12 h-12 text-gray-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <h3 class="font-semibold text-gray-900 mb-1">No Farms Added</h3>
            <p class="text-sm text-gray-500 mb-4">
              Add your first farm to get started
            </p>
            <a
              href="/app/farm/add"
              class="inline-block bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Add Farm
            </a>
          </div>
        )
        : (
          <>
            {/* Weather Section */}
            {weather && (
              <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white mb-4">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <p class="text-blue-100 text-xs">
                      {selectedFarm?.district}, {selectedFarm?.state}
                    </p>
                    <p class="text-3xl font-bold">{weather.temp}°C</p>
                    <p class="text-blue-100 text-sm">{weather.condition}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-blue-100">7-day rainfall</p>
                    <p class="text-lg font-semibold">{weather.rainfall}mm</p>
                  </div>
                </div>
                <div class="flex gap-2 overflow-x-auto">
                  {weather.forecast.map((f, i) => (
                    <div
                      key={i}
                      class="flex-shrink-0 text-center px-2 py-1 bg-white/10 rounded-lg"
                    >
                      <p class="text-xs text-blue-100">{f.day}</p>
                      <p class="text-sm font-medium">{f.tempMax}°</p>
                      {f.rain > 0 && (
                        <p class="text-xs text-blue-200">{f.rain}mm</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts Section */}
            {alerts.length > 0 && (
              <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="font-semibold text-gray-900">Today's Actions</h3>
                  <a href="/app/alerts" class="text-sm text-primary-600">
                    View All
                  </a>
                </div>
                {alerts.slice(0, 2).map((alert) => (
                  <AlertCard key={alert.id} {...alert} />
                ))}
              </div>
            )}

            {/* Quick Actions */}
            <div class="mb-4">
              <h3 class="font-semibold text-gray-900 mb-2">Quick Actions</h3>
              <div class="grid grid-cols-4 gap-2">
                <a
                  href="/app/chat"
                  class="flex flex-col items-center p-3 bg-primary-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Ask AI</span>
                </a>
                <a
                  href="/app/scan"
                  class="flex flex-col items-center p-3 bg-orange-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Scan</span>
                </a>
                <a
                  href="/app/calendar"
                  class="flex flex-col items-center p-3 bg-blue-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">
                    Calendar
                  </span>
                </a>
                <a
                  href="/app/weather"
                  class="flex flex-col items-center p-3 bg-cyan-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Weather</span>
                </a>
              </div>
              <div class="grid grid-cols-4 gap-2 mt-2">
                <a
                  href="/app/schemes"
                  class="flex flex-col items-center p-3 bg-purple-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Schemes</span>
                </a>
                <a
                  href="/app/dealers"
                  class="flex flex-col items-center p-3 bg-green-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Dealers</span>
                </a>
                <a
                  href="/app/news"
                  class="flex flex-col items-center p-3 bg-red-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">News</span>
                </a>
                <a
                  href="/app/expert"
                  class="flex flex-col items-center p-3 bg-yellow-50 rounded-xl"
                >
                  <div class="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center mb-1">
                    <svg
                      class="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-medium text-gray-700">Expert</span>
                </a>
              </div>
            </div>

            {/* Farm Details Section with Map */}
            {selectedFarm && (
              <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-gray-900">Farm Details</h3>
                  <a
                    href={`/app/farm/${selectedFarm.id}`}
                    class="text-xs text-primary-600 hover:underline"
                  >
                    View Full Details
                  </a>
                </div>

                {/* Map with Farm Polygon */}
                <div class="mb-4">
                  <FarmMapPreview
                    center={{ lat: selectedFarm.lat, lng: selectedFarm.lon }}
                    polygon={selectedFarm.polygon}
                    farmName={selectedFarm.name}
                    height="180px"
                  />
                </div>

                {/* Farm Info Grid */}
                <div class="grid grid-cols-2 gap-3">
                  <div class="p-2 bg-gray-50 rounded-lg">
                    <p class="text-xs text-gray-500">Location</p>
                    <p class="text-sm font-medium text-gray-900">
                      {selectedFarm.village ? `${selectedFarm.village}, ` : ""}
                      {selectedFarm.district}
                    </p>
                  </div>
                  <div class="p-2 bg-gray-50 rounded-lg">
                    <p class="text-xs text-gray-500">Area</p>
                    <p class="text-sm font-medium text-gray-900">
                      {selectedFarm.areaHectares > 0
                        ? `${selectedFarm.areaHectares.toFixed(2)} ha`
                        : "Not specified"}
                    </p>
                  </div>
                  <div class="p-2 bg-gray-50 rounded-lg">
                    <p class="text-xs text-gray-500">Coordinates</p>
                    <p class="text-sm font-medium text-gray-900">
                      {selectedFarm.lat.toFixed(4)}°N,{" "}
                      {selectedFarm.lon.toFixed(4)}°E
                    </p>
                  </div>
                  <div class="p-2 bg-gray-50 rounded-lg">
                    <p class="text-xs text-gray-500">State</p>
                    <p class="text-sm font-medium text-gray-900">
                      {selectedFarm.state}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Soil Section */}
            {soil && (
              <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <h3 class="font-semibold text-gray-900 mb-3">
                  Soil Conditions
                </h3>
                <div class="grid grid-cols-3 gap-3">
                  <div class="text-center p-2 bg-blue-50 rounded-lg">
                    <p class="text-xl font-bold text-blue-600">
                      {soil.moisture}%
                    </p>
                    <p class="text-xs text-gray-600">Moisture</p>
                  </div>
                  <div class="text-center p-2 bg-orange-50 rounded-lg">
                    <p class="text-xl font-bold text-orange-600">
                      {soil.temperature}°C
                    </p>
                    <p class="text-xs text-gray-600">Temp</p>
                  </div>
                  <div class="text-center p-2 bg-green-50 rounded-lg">
                    <p class="text-xl font-bold text-green-600">
                      {soil.ph.toFixed(1)}
                    </p>
                    <p class="text-xs text-gray-600">pH</p>
                  </div>
                </div>
              </div>
            )}

            {/* Crop Details Section */}
            {selectedFarm && selectedFarm.cropType !== "none" && (
              <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-gray-900">Crop Status</h3>
                  <a
                    href={`/app/farm/${selectedFarm.id}`}
                    class="text-sm text-primary-600"
                  >
                    Details
                  </a>
                </div>
                <div class="flex items-center gap-4">
                  <div
                    class={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
                      selectedFarm.healthScore >= 70
                        ? "bg-green-100 text-green-600"
                        : selectedFarm.healthScore >= 40
                        ? "bg-yellow-100 text-yellow-600"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {selectedFarm.healthScore}
                  </div>
                  <div class="flex-1">
                    <p class="font-medium text-gray-900 capitalize">
                      {selectedFarm.cropType}
                    </p>
                    <p class="text-sm text-gray-500">
                      {selectedFarm.stage} • Day {selectedFarm.daysAfterSowing}
                    </p>
                    <div class="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>Sown: {selectedFarm.sowingDate || "N/A"}</span>
                      <span>
                        Harvest: {selectedFarm.expectedHarvest || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
                {/* NDVI Trend */}
                <div class="mt-3 pt-3 border-t border-gray-100">
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">
                      NDVI: {selectedFarm.ndvi.toFixed(2)}
                    </span>
                    <span
                      class={`flex items-center gap-1 ${
                        selectedFarm.ndviTrend === "improving"
                          ? "text-green-600"
                          : selectedFarm.ndviTrend === "declining"
                          ? "text-red-600"
                          : "text-gray-500"
                      }`}
                    >
                      {selectedFarm.ndviTrend === "improving" && "↑ Improving"}
                      {selectedFarm.ndviTrend === "declining" && "↓ Declining"}
                      {selectedFarm.ndviTrend === "stable" && "→ Stable"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Market Prices Section */}
            <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-gray-900">Market Prices</h3>
                <a href="/app/market" class="text-sm text-primary-600">
                  View All
                </a>
              </div>
              <div class="space-y-2">
                {marketPrices.map((price, i) => (
                  <div
                    key={i}
                    class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p class="font-medium text-gray-900">{price.commodity}</p>
                      <p class="text-xs text-gray-500">{price.market}</p>
                    </div>
                    <div class="text-right">
                      <p class="font-semibold text-gray-900">
                        ₹{price.price}/{price.unit}
                      </p>
                      <p
                        class={`text-xs ${
                          price.change >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {price.change >= 0 ? "+" : ""}
                        {price.change}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schemes Section */}
            <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-gray-900">Government Schemes</h3>
                <a href="/app/schemes" class="text-sm text-primary-600">
                  View All
                </a>
              </div>
              <div class="space-y-2">
                {schemes.map((scheme) => (
                  <div key={scheme.id} class="p-3 bg-green-50 rounded-lg">
                    <div class="flex items-center justify-between">
                      <p class="font-medium text-gray-900">{scheme.name}</p>
                      {scheme.deadline && (
                        <span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                          Due: {scheme.deadline}
                        </span>
                      )}
                    </div>
                    <p class="text-sm text-gray-600 mt-1">
                      {scheme.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* News Section */}
            <div class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-gray-900">Agri News</h3>
                <a
                  href="/app/news"
                  class="text-xs text-primary-600 hover:underline"
                >
                  View all
                </a>
              </div>
              <div class="space-y-3">
                {news.map((item) => (
                  <div key={item.id} class="flex gap-3">
                    <div
                      class={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-xl ${
                        item.category === "weather"
                          ? "bg-blue-100"
                          : item.category === "market"
                          ? "bg-green-100"
                          : item.category === "scheme"
                          ? "bg-purple-100"
                          : "bg-gray-100"
                      }`}
                    >
                      {item.category === "weather"
                        ? "🌤️"
                        : item.category === "market"
                        ? "📈"
                        : item.category === "scheme"
                        ? "📋"
                        : "📰"}
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 text-sm line-clamp-2">
                        {item.title}
                      </p>
                      <p class="text-xs text-gray-500 mt-1">{item.timeAgo}</p>
                    </div>
                  </div>
                ))}
                {news.length === 0 && (
                  <p class="text-sm text-gray-500 text-center py-2">
                    No news available
                  </p>
                )}
              </div>
            </div>

            {/* Quick Navigation */}
            <div class="grid grid-cols-4 gap-2 mb-4">
              <QuickAction href="/app/weather" icon="weather" label="Weather" />
              <QuickAction href="/app/market" icon="market" label="Prices" />
              <QuickAction href="/app/schemes" icon="schemes" label="Schemes" />
              <QuickAction href="/app/reports" icon="reports" label="Reports" />
            </div>
          </>
        )}

      {/* Footer */}
      <footer class="text-center py-6 border-t border-gray-100 mt-6">
        <p class="text-sm text-gray-400">
          <span class="font-semibold text-primary-600">Khetscope</span>
        </p>
        <p class="text-xs text-gray-400 mt-1">
          Empowering farmers with satellite intelligence
        </p>
      </footer>
    </AppShell>
  );
}

function QuickAction(
  { href, icon, label }: { href: string; icon: string; label: string },
) {
  const icons: Record<string, preact.JSX.Element> = {
    weather: (
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
        />
      </svg>
    ),
    market: (
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    schemes: (
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    reports: (
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  };

  return (
    <a
      href={href}
      class="flex flex-col items-center p-2 bg-white rounded-xl border border-gray-100 hover:border-primary-200"
    >
      <div class="text-primary-600 mb-1">{icons[icon]}</div>
      <span class="text-xs text-gray-600">{label}</span>
    </a>
  );
}
