import { Handlers } from "$fresh/server.ts";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import {
  getFarmHealthStats,
  getObservationsByFarm,
} from "$lib/observations.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import {
  formatDataForExport,
  getComprehensiveFarmData,
} from "$lib/satellite/index.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

export const handler: Handlers<null, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = ctx.params;
    const { session, user } = ctx.state;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const comprehensive = url.searchParams.get("comprehensive") === "true";

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(JSON.stringify({ error: "Farm not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [crop, stats, observations, alerts] = await Promise.all([
      getActiveCropByFarm(farm.id),
      getFarmHealthStats(farm.id),
      getObservationsByFarm(farm.id, { limit: 365 }),
      getAlertsWithAdvisory(farm.id, session.tenantId, user.language, {
        limit: 100,
      }),
    ]);

    // If comprehensive data is requested, fetch from all sources
    let comprehensiveData = null;
    if (comprehensive) {
      try {
        const lat = farm.latitude || 20.5937;
        const lon = farm.longitude || 78.9629;
        comprehensiveData = await getComprehensiveFarmData({
          lat,
          lon,
          farmId: farm.id,
        });
      } catch (error) {
        console.warn("[Export] Comprehensive data fetch failed:", error);
      }
    }

    if (format === "json") {
      return new Response(
        JSON.stringify(
          {
            farm: {
              name: farm.name,
              district: farm.district,
              state: farm.state,
              village: farm.village,
              areaHectares: farm.areaHectares,
              soilType: farm.soilType,
              waterSource: farm.waterSource,
            },
            crop: crop
              ? {
                type: crop.cropType,
                variety: crop.variety,
                sowingDate: crop.sowingDate,
                irrigationType: crop.irrigationType,
                season: crop.season,
              }
              : null,
            healthStats: {
              healthScore: stats.healthScore,
              latestNdvi: stats.latestNdvi,
              ndviTrend: stats.ndviTrend,
              totalRainfall7d: stats.totalRainfall7d,
            },
            observations: observations.map((o) => ({
              date: o.observationDate,
              ndvi: o.ndvi,
              evi: o.evi,
              healthScore: o.healthScore,
              rainfall: o.rainfall24h,
              source: o.source,
            })),
            alerts: alerts.map((a) => ({
              type: a.type,
              severity: a.severity,
              title: a.title,
              message: a.message,
              createdAt: a.createdAt,
            })),
            // Comprehensive multi-source data (when requested)
            ...(comprehensiveData
              ? {
                comprehensiveData: {
                  satellite: comprehensiveData.satellite,
                  weather: comprehensiveData.weather,
                  soil: comprehensiveData.soil,
                  climate: comprehensiveData.climate,
                  landUse: comprehensiveData.landUse,
                  market: comprehensiveData.market,
                  nearby: comprehensiveData.nearby,
                  sources: comprehensiveData.sources,
                },
              }
              : {}),
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${
              farm.name.replace(/[^a-z0-9]/gi, "_")
            }_data.json"`,
          },
        },
      );
    }

    // CSV format
    const csvLines: string[] = [];

    // Farm Info
    csvLines.push("=== FARM INFORMATION ===");
    csvLines.push(`Name,${farm.name}`);
    csvLines.push(`District,${farm.district || "N/A"}`);
    csvLines.push(`State,${farm.state || "N/A"}`);
    csvLines.push(`Village,${farm.village || "N/A"}`);
    csvLines.push(`Area (Hectares),${farm.areaHectares}`);
    csvLines.push(`Soil Type,${farm.soilType || "N/A"}`);
    csvLines.push(`Water Source,${farm.waterSource || "N/A"}`);
    csvLines.push("");

    // Crop Info
    if (crop) {
      csvLines.push("=== CROP INFORMATION ===");
      csvLines.push(`Crop Type,${crop.cropType}`);
      csvLines.push(`Variety,${crop.variety || "N/A"}`);
      csvLines.push(
        `Sowing Date,${new Date(crop.sowingDate).toLocaleDateString("en-IN")}`,
      );
      csvLines.push(`Irrigation,${crop.irrigationType}`);
      csvLines.push(`Season,${crop.season}`);
      csvLines.push("");
    }

    // Health Stats
    csvLines.push("=== HEALTH STATISTICS ===");
    csvLines.push(`Health Score,${stats.healthScore ?? "N/A"}`);
    csvLines.push(`Latest NDVI,${stats.latestNdvi ?? "N/A"}`);
    csvLines.push(`NDVI Trend,${stats.ndviTrend ?? "N/A"}`);
    csvLines.push(`7-day Rainfall (mm),${stats.totalRainfall7d ?? "N/A"}`);
    csvLines.push("");

    // Observations
    csvLines.push("=== OBSERVATIONS ===");
    csvLines.push("Date,NDVI,EVI,Health Score,Rainfall (mm),Source");
    observations.forEach((o) => {
      const ndvi = o.ndvi != null ? Number(o.ndvi) : null;
      const evi = o.evi != null ? Number(o.evi) : null;
      const healthScore = o.healthScore != null ? Number(o.healthScore) : null;
      const rainfall = o.rainfall24h != null ? Number(o.rainfall24h) : null;
      csvLines.push([
        new Date(o.observationDate).toLocaleDateString("en-IN"),
        ndvi?.toFixed(3) ?? "",
        evi?.toFixed(3) ?? "",
        healthScore?.toFixed(1) ?? "",
        rainfall?.toFixed(1) ?? "",
        o.source || "",
      ].join(","));
    });
    csvLines.push("");

    // Alerts
    csvLines.push("=== ALERTS HISTORY ===");
    csvLines.push("Date,Type,Severity,Title,Message");
    alerts.forEach((a) => {
      csvLines.push([
        new Date(a.createdAt).toLocaleDateString("en-IN"),
        a.type,
        a.severity,
        `"${(a.title || "").replace(/"/g, '""')}"`,
        `"${(a.message || "").replace(/"/g, '""')}"`,
      ].join(","));
    });

    // Comprehensive Data (when requested)
    if (comprehensiveData) {
      const exportData = formatDataForExport(comprehensiveData);

      csvLines.push("");
      csvLines.push("=== SATELLITE DATA (Multi-Source) ===");
      for (const [key, value] of Object.entries(exportData.satellite)) {
        csvLines.push(`${key},${value}`);
      }

      csvLines.push("");
      csvLines.push("=== WEATHER DATA ===");
      for (const [key, value] of Object.entries(exportData.weather)) {
        csvLines.push(`${key},${value}`);
      }

      csvLines.push("");
      csvLines.push("=== SOIL ANALYSIS (SoilGrids/ISRIC) ===");
      for (const [key, value] of Object.entries(exportData.soil)) {
        csvLines.push(`${key},${value}`);
      }

      csvLines.push("");
      csvLines.push("=== CLIMATE DATA (NASA POWER) ===");
      for (const [key, value] of Object.entries(exportData.climate)) {
        csvLines.push(`${key},${value}`);
      }

      csvLines.push("");
      csvLines.push("=== DATA SOURCES ===");
      csvLines.push(`Sources Used,"${exportData.sources.join(", ")}"`);
    }

    csvLines.push("");
    csvLines.push(`Exported on,${new Date().toLocaleString("en-IN")}`);

    return new Response(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${
          farm.name.replace(/[^a-z0-9]/gi, "_")
        }_data.csv"`,
      },
    });
  },
};
