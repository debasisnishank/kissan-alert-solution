import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface AnalyticsData {
  overview: {
    totalFarms: number;
    totalFarmers: number;
    totalArea: number;
    activeAlerts: number;
  };
  cropDistribution: Array<{ crop: string; count: number; area: number }>;
  healthDistribution: {
    excellent: number;
    good: number;
    moderate: number;
    poor: number;
  };
  alertsByType: Array<{ type: string; count: number }>;
  recentActivity: Array<{
    action: string;
    entity: string;
    timestamp: string;
    user: string;
  }>;
  monthlyTrends: Array<{
    month: string;
    farms: number;
    alerts: number;
    avgHealth: number;
  }>;
  topPerformingFarms: Array<{
    name: string;
    district: string;
    healthScore: number;
    crop: string;
  }>;
  weatherImpact: {
    drought: number;
    flood: number;
    normal: number;
  };
}

interface AnalyticsPageData extends AnalyticsData {
  range: string;
}

export const handler: Handlers<AnalyticsPageData, AuthState> = {
  async GET(req, ctx) {
    if (
      !ctx.state.session ||
      (ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin")
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "30";

    const rangeMap: Record<string, string> = {
      "7": "7 days",
      "30": "30 days",
      "90": "90 days",
      "365": "1 year",
    };
    const interval = rangeMap[range] || "30 days";

    if (url.searchParams.get("export") === "csv") {
      return exportCSV(tenantId);
    }

    // Overview stats
    const overviewStats = await queryOne<{
      total_farms: number;
      total_farmers: number;
      total_area: number;
    }>(
      `SELECT 
        COUNT(DISTINCT f.id) as total_farms,
        COUNT(DISTINCT f.farmer_id) as total_farmers,
        COALESCE(SUM(f.area_hectares), 0) as total_area
      FROM farms f
      WHERE f.tenant_id = $1 AND f.is_active = true`,
      [tenantId],
    );

    const activeAlerts = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM alerts 
       WHERE tenant_id = $1 AND expires_at > NOW()`,
      [tenantId],
    );

    // Crop distribution
    const cropDistribution = await query<{
      crop: string;
      count: number;
      area: number;
    }>(
      `SELECT 
        fc.crop_type as crop, 
        COUNT(*) as count,
        COALESCE(SUM(f.area_hectares), 0) as area
      FROM farm_crops fc
      JOIN farms f ON fc.farm_id = f.id
      WHERE f.tenant_id = $1 AND fc.is_active = true
      GROUP BY fc.crop_type
      ORDER BY count DESC
      LIMIT 10`,
      [tenantId],
    );

    // Health distribution from recent observations
    const healthStats = await query<{ health_bucket: string; count: number }>(
      `WITH latest_obs AS (
        SELECT DISTINCT ON (farm_id) farm_id, health_score
        FROM farm_observations
        WHERE observation_date >= NOW() - INTERVAL '7 days'
        ORDER BY farm_id, observation_date DESC
      )
      SELECT 
        CASE 
          WHEN health_score >= 80 THEN 'excellent'
          WHEN health_score >= 60 THEN 'good'
          WHEN health_score >= 40 THEN 'moderate'
          ELSE 'poor'
        END as health_bucket,
        COUNT(*) as count
      FROM latest_obs
      GROUP BY health_bucket`,
      [],
    );

    const healthDistribution = {
      excellent: 0,
      good: 0,
      moderate: 0,
      poor: 0,
    };
    healthStats.forEach((h) => {
      healthDistribution[h.health_bucket as keyof typeof healthDistribution] =
        Number(h.count);
    });

    // Alerts by type
    const alertsByType = await query<{ type: string; count: number }>(
      `SELECT type, COUNT(*) as count
       FROM alerts
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY type
       ORDER BY count DESC`,
      [tenantId],
    );

    // Recent activity from audit logs
    const recentActivity = await query<{
      action: string;
      entity: string;
      timestamp: string;
      user: string;
    }>(
      `SELECT 
        al.action,
        al.entity_type as entity,
        al.created_at as timestamp,
        COALESCE(u.name, 'System') as user
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = $1
      ORDER BY al.created_at DESC
      LIMIT 10`,
      [tenantId],
    );

    // Monthly trends (last 6 months)
    const monthlyTrends = await query<{
      month: string;
      farms: number;
      alerts: number;
      avg_health: number;
    }>(
      `WITH months AS (
        SELECT generate_series(
          date_trunc('month', NOW() - INTERVAL '5 months'),
          date_trunc('month', NOW()),
          '1 month'::interval
        ) as month
      )
      SELECT 
        to_char(m.month, 'Mon') as month,
        COUNT(DISTINCT f.id) as farms,
        COUNT(DISTINCT a.id) as alerts,
        COALESCE(AVG(o.health_score), 0) as avg_health
      FROM months m
      LEFT JOIN farms f ON f.tenant_id = $1 
        AND date_trunc('month', f.created_at) <= m.month
        AND f.is_active = true
      LEFT JOIN alerts a ON a.tenant_id = $1 
        AND date_trunc('month', a.created_at) = m.month
      LEFT JOIN farm_observations o ON o.farm_id = f.id
        AND date_trunc('month', o.observation_date) = m.month
      GROUP BY m.month
      ORDER BY m.month`,
      [tenantId],
    );

    // Top performing farms
    const topPerformingFarms = await query<{
      name: string;
      district: string;
      health_score: number;
      crop: string;
    }>(
      `SELECT DISTINCT ON (f.id)
        f.name,
        f.district,
        COALESCE(o.health_score, 0) as health_score,
        COALESCE(fc.crop_type, 'N/A') as crop
      FROM farms f
      LEFT JOIN farm_observations o ON o.farm_id = f.id
      LEFT JOIN farm_crops fc ON fc.farm_id = f.id AND fc.is_active = true
      WHERE f.tenant_id = $1 AND f.is_active = true
      ORDER BY f.id, o.observation_date DESC, o.health_score DESC
      LIMIT 5`,
      [tenantId],
    );

    // Weather impact (based on recent alerts)
    const weatherImpact = await queryOne<{
      drought: number;
      flood: number;
      normal: number;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE type = 'drought') as drought,
        COUNT(*) FILTER (WHERE type IN ('flood', 'heavy_rain')) as flood,
        COUNT(*) FILTER (WHERE type NOT IN ('drought', 'flood', 'heavy_rain')) as normal
      FROM alerts
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${interval}'`,
      [tenantId],
    );

    return ctx.render({
      overview: {
        totalFarms: Number(overviewStats?.total_farms || 0),
        totalFarmers: Number(overviewStats?.total_farmers || 0),
        totalArea: Number(overviewStats?.total_area || 0),
        activeAlerts: Number(activeAlerts?.count || 0),
      },
      cropDistribution: cropDistribution.map((c) => ({
        crop: c.crop,
        count: Number(c.count),
        area: Number(c.area),
      })),
      healthDistribution,
      alertsByType: alertsByType.map((a) => ({
        type: a.type,
        count: Number(a.count),
      })),
      recentActivity: recentActivity.map((a) => ({
        ...a,
        timestamp: new Date(a.timestamp).toLocaleString("en-IN"),
      })),
      monthlyTrends: monthlyTrends.map((m) => ({
        month: m.month,
        farms: Number(m.farms),
        alerts: Number(m.alerts),
        avgHealth: Number(m.avg_health),
      })),
      topPerformingFarms: topPerformingFarms.map((f) => ({
        name: f.name,
        district: f.district,
        healthScore: Number(f.health_score),
        crop: f.crop,
      })),
      weatherImpact: {
        drought: Number(weatherImpact?.drought || 0),
        flood: Number(weatherImpact?.flood || 0),
        normal: Number(weatherImpact?.normal || 0),
      },
      range,
    });
  },
};

async function exportCSV(
  tenantId: string,
): Promise<Response> {
  const farms = await query<{
    name: string;
    district: string;
    area: number;
    crop: string;
    health: number;
  }>(
    `SELECT f.name, f.district, f.area_hectares as area,
            COALESCE(fc.crop_type, '') as crop,
            COALESCE(o.health_score, 0) as health
     FROM farms f
     LEFT JOIN farm_crops fc ON fc.farm_id = f.id AND fc.is_active = true
     LEFT JOIN LATERAL (
       SELECT health_score FROM farm_observations
       WHERE farm_id = f.id ORDER BY observation_date DESC LIMIT 1
     ) o ON true
     WHERE f.tenant_id = $1 AND f.is_active = true
     ORDER BY f.name`,
    [tenantId],
  );

  const rows = ["Name,District,Area (ha),Crop,Health Score"];
  for (const f of farms) {
    rows.push(
      `"${f.name}","${f.district}",${Number(f.area).toFixed(1)},"${f.crop}",${
        Number(f.health)
      }`,
    );
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="khetscope-analytics-${
        new Date().toISOString().split("T")[0]
      }.csv"`,
    },
  });
}

export default function AnalyticsPage({ data }: PageProps<AnalyticsPageData>) {
  const totalHealth = data.healthDistribution.excellent +
    data.healthDistribution.good +
    data.healthDistribution.moderate +
    data.healthDistribution.poor;

  const ranges = [
    ["7", "Last 7 days"],
    ["30", "Last 30 days"],
    ["90", "Last 90 days"],
    ["365", "This year"],
  ];

  return (
    <AdminLayout title="Analytics" currentPage="analytics">
      <div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500">
            Platform insights and performance metrics
          </p>
          <div class="flex gap-2">
            {ranges.map(([val, label]) => (
              <a
                key={val}
                href={`/admin/analytics?range=${val}`}
                class={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  data.range === val
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-600 border hover:bg-gray-50"
                }`}
              >
                {label}
              </a>
            ))}
            <a
              href={`/admin/analytics?range=${data.range}&export=csv`}
              class="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800"
            >
              Export CSV
            </a>
          </div>
        </div>
        {/* Overview Cards */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl p-6 border">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"
                  />
                </svg>
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">
                  {data.overview.totalFarms}
                </p>
                <p class="text-sm text-gray-500">Total Farms</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl p-6 border">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                  />
                </svg>
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">
                  {data.overview.totalFarmers}
                </p>
                <p class="text-sm text-gray-500">Farmers</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl p-6 border">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">
                  {data.overview.totalArea.toFixed(1)}
                </p>
                <p class="text-sm text-gray-500">Hectares</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl p-6 border">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <p class="text-2xl font-bold text-gray-900">
                  {data.overview.activeAlerts}
                </p>
                <p class="text-sm text-gray-500">Active Alerts</p>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Crop Distribution */}
          <div class="bg-white rounded-xl border p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Crop Distribution
            </h2>
            {data.cropDistribution.length > 0
              ? (
                <div class="space-y-3">
                  {data.cropDistribution.map((crop) => (
                    <div key={crop.crop} class="flex items-center gap-3">
                      <div class="w-24 text-sm text-gray-600 capitalize truncate">
                        {crop.crop}
                      </div>
                      <div class="flex-1">
                        <div class="h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            class="h-full bg-green-500 rounded-full"
                            style={{
                              width: `${
                                Math.min(
                                  (crop.count /
                                    Math.max(
                                      ...data.cropDistribution.map((c) =>
                                        c.count
                                      ),
                                    )) *
                                    100,
                                  100,
                                )
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <div class="w-20 text-right">
                        <span class="text-sm font-medium text-gray-900">
                          {crop.count}
                        </span>
                        <span class="text-xs text-gray-500 ml-1">farms</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
              : (
                <p class="text-gray-500 text-sm">
                  No crop data available yet
                </p>
              )}
          </div>

          {/* Farm Health Distribution */}
          <div class="bg-white rounded-xl border p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Farm Health Distribution
            </h2>
            {totalHealth > 0
              ? (
                <div class="space-y-4">
                  <div class="flex h-8 rounded-lg overflow-hidden">
                    {data.healthDistribution.excellent > 0 && (
                      <div
                        class="bg-green-500"
                        style={{
                          width: `${
                            (data.healthDistribution.excellent /
                              totalHealth) *
                            100
                          }%`,
                        }}
                        title={`Excellent: ${data.healthDistribution.excellent}`}
                      />
                    )}
                    {data.healthDistribution.good > 0 && (
                      <div
                        class="bg-blue-500"
                        style={{
                          width: `${
                            (data.healthDistribution.good / totalHealth) * 100
                          }%`,
                        }}
                        title={`Good: ${data.healthDistribution.good}`}
                      />
                    )}
                    {data.healthDistribution.moderate > 0 && (
                      <div
                        class="bg-yellow-500"
                        style={{
                          width: `${
                            (data.healthDistribution.moderate / totalHealth) *
                            100
                          }%`,
                        }}
                        title={`Moderate: ${data.healthDistribution.moderate}`}
                      />
                    )}
                    {data.healthDistribution.poor > 0 && (
                      <div
                        class="bg-red-500"
                        style={{
                          width: `${
                            (data.healthDistribution.poor / totalHealth) * 100
                          }%`,
                        }}
                        title={`Poor: ${data.healthDistribution.poor}`}
                      />
                    )}
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 bg-green-500 rounded" />
                      <span class="text-sm text-gray-600">
                        Excellent (80+):{" "}
                        <strong>{data.healthDistribution.excellent}</strong>
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 bg-blue-500 rounded" />
                      <span class="text-sm text-gray-600">
                        Good (60-79):{" "}
                        <strong>{data.healthDistribution.good}</strong>
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 bg-yellow-500 rounded" />
                      <span class="text-sm text-gray-600">
                        Moderate (40-59):{" "}
                        <strong>{data.healthDistribution.moderate}</strong>
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 bg-red-500 rounded" />
                      <span class="text-sm text-gray-600">
                        Poor (&lt;40):{" "}
                        <strong>{data.healthDistribution.poor}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )
              : (
                <p class="text-gray-500 text-sm">
                  No health data available yet
                </p>
              )}
          </div>

          {/* Alerts by Type */}
          <div class="bg-white rounded-xl border p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Alerts by Type (Last 30 Days)
            </h2>
            {data.alertsByType.length > 0
              ? (
                <div class="space-y-3">
                  {data.alertsByType.map((alert) => (
                    <div
                      key={alert.type}
                      class="flex items-center justify-between"
                    >
                      <div class="flex items-center gap-2">
                        <span
                          class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                            alert.type === "drought"
                              ? "bg-orange-100 text-orange-700"
                              : alert.type === "pest"
                              ? "bg-red-100 text-red-700"
                              : alert.type === "weather"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {alert.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span class="text-lg font-semibold text-gray-900">
                        {alert.count}
                      </span>
                    </div>
                  ))}
                </div>
              )
              : <p class="text-gray-500 text-sm">No alerts in this period</p>}
          </div>

          {/* Top Performing Farms */}
          <div class="bg-white rounded-xl border p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Top Performing Farms
            </h2>
            {data.topPerformingFarms.length > 0
              ? (
                <div class="space-y-3">
                  {data.topPerformingFarms.map((farm, index) => (
                    <div
                      key={index}
                      class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p class="font-medium text-gray-900">{farm.name}</p>
                        <p class="text-sm text-gray-500">
                          {farm.district} - {farm.crop}
                        </p>
                      </div>
                      <div
                        class={`text-lg font-bold ${
                          farm.healthScore >= 80
                            ? "text-green-600"
                            : farm.healthScore >= 60
                            ? "text-blue-600"
                            : "text-yellow-600"
                        }`}
                      >
                        {farm.healthScore.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              )
              : <p class="text-gray-500 text-sm">No farm data available</p>}
          </div>
        </div>

        {/* Monthly Trends */}
        <div class="bg-white rounded-xl border p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Monthly Trends (Last 6 Months)
          </h2>
          {data.monthlyTrends.length > 0
            ? (
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">
                        Month
                      </th>
                      <th class="text-right py-3 px-4 text-sm font-medium text-gray-500">
                        Active Farms
                      </th>
                      <th class="text-right py-3 px-4 text-sm font-medium text-gray-500">
                        Alerts
                      </th>
                      <th class="text-right py-3 px-4 text-sm font-medium text-gray-500">
                        Avg Health
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlyTrends.map((month) => (
                      <tr key={month.month} class="border-b last:border-0">
                        <td class="py-3 px-4 font-medium text-gray-900">
                          {month.month}
                        </td>
                        <td class="py-3 px-4 text-right text-gray-600">
                          {month.farms}
                        </td>
                        <td class="py-3 px-4 text-right text-gray-600">
                          {month.alerts}
                        </td>
                        <td class="py-3 px-4 text-right">
                          <span
                            class={`font-medium ${
                              month.avgHealth >= 70
                                ? "text-green-600"
                                : month.avgHealth >= 50
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {month.avgHealth.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p class="text-gray-500 text-sm">No trend data available</p>}
        </div>

        {/* Recent Activity */}
        <div class="bg-white rounded-xl border p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Recent Activity
          </h2>
          {data.recentActivity.length > 0
            ? (
              <div class="space-y-3">
                {data.recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    class="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class={`w-2 h-2 rounded-full ${
                          activity.action === "create"
                            ? "bg-green-500"
                            : activity.action === "update"
                            ? "bg-blue-500"
                            : activity.action === "delete"
                            ? "bg-red-500"
                            : "bg-gray-500"
                        }`}
                      />
                      <div>
                        <span class="font-medium text-gray-900 capitalize">
                          {activity.action}
                        </span>
                        <span class="text-gray-500">{activity.entity}</span>
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="text-sm text-gray-500">{activity.user}</p>
                      <p class="text-xs text-gray-400">
                        {activity.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
            : <p class="text-gray-500 text-sm">No recent activity logged</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
