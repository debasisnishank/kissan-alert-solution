import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import { getFarmsByFarmer } from "$lib/farm.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ReportData {
  id: string;
  farmName: string;
  cropType: string;
  date: string;
  healthScore: number;
  alertCount: number;
  type: "observation" | "analysis" | "alert";
}

interface ReportsPageData {
  reports: ReportData[];
  summary: {
    totalScans: number;
    avgHealth: number;
    alertsResolved: number;
  };
}

export const handler: Handlers<ReportsPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);
    const farmIds = farms.map((f) => f.id);
    const farmMap = new Map(farms.map((f) => [f.id, f.name]));

    if (farmIds.length === 0) {
      return ctx.render({
        reports: [],
        summary: { totalScans: 0, avgHealth: 0, alertsResolved: 0 },
      });
    }

    // Get recent observations
    const observations = await query<{
      id: string;
      farm_id: string;
      observation_date: Date;
      health_score: number;
      stage_estimate: string;
    }>(
      `SELECT id, farm_id, observation_date, health_score, stage_estimate
       FROM farm_observations
       WHERE farm_id = ANY($1)
       ORDER BY observation_date DESC
       LIMIT 30`,
      [farmIds],
    );

    // Get crop types
    const crops = await query<{ farm_id: string; crop_type: string }>(
      `SELECT farm_id, crop_type FROM crop_declarations
       WHERE farm_id = ANY($1) AND is_active = true`,
      [farmIds],
    );
    const cropMap = new Map(crops.map((c) => [c.farm_id, c.crop_type]));

    // Get alert counts per farm
    const alertCounts = await query<{ farm_id: string; count: number }>(
      `SELECT farm_id, COUNT(*) as count FROM alerts
       WHERE farm_id = ANY($1) AND status = 'active'
       GROUP BY farm_id`,
      [farmIds],
    );
    const alertMap = new Map(
      alertCounts.map((a) => [a.farm_id, Number(a.count)]),
    );

    // Get resolved alerts count
    const resolvedResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM alerts
       WHERE farm_id = ANY($1) AND status = 'resolved'`,
      [farmIds],
    );
    const resolvedCount = Number(resolvedResult[0]?.count || 0);

    const reports: ReportData[] = observations.map((obs) => ({
      id: obs.id,
      farmName: farmMap.get(obs.farm_id) || "Unknown Farm",
      cropType: cropMap.get(obs.farm_id) || "Unknown",
      date: new Date(obs.observation_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      healthScore: Number(obs.health_score) || 0,
      alertCount: alertMap.get(obs.farm_id) || 0,
      type: "observation",
    }));

    // Calculate summary
    const totalScans = observations.length;
    const avgHealth = totalScans > 0
      ? Math.round(
        observations.reduce(
          (sum, o) => sum + (Number(o.health_score) || 0),
          0,
        ) / totalScans,
      )
      : 0;

    return ctx.render({
      reports,
      summary: {
        totalScans,
        avgHealth,
        alertsResolved: resolvedCount,
      },
    });
  },
};

export default function ReportsPage({ data }: PageProps<ReportsPageData>) {
  const { reports, summary } = data;

  return (
    <AppShell title="Reports & History" showBack>
      {/* Summary Cards */}
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p class="text-2xl font-bold text-primary-600">
            {summary.totalScans}
          </p>
          <p class="text-xs text-gray-500">Total Scans</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p class="text-2xl font-bold text-green-600">{summary.avgHealth}%</p>
          <p class="text-xs text-gray-500">Avg Health</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p class="text-2xl font-bold text-blue-600">
            {summary.alertsResolved}
          </p>
          <p class="text-xs text-gray-500">Resolved</p>
        </div>
      </div>

      {/* Reports List */}
      <div class="space-y-3">
        <h2 class="font-semibold text-gray-900">Recent Activity</h2>

        {reports.length > 0
          ? (
            reports.map((report) => (
              <div
                key={report.id}
                class="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <h3 class="font-medium text-gray-900">{report.farmName}</h3>
                    <p class="text-sm text-gray-500 capitalize">
                      {report.cropType} • {report.date}
                    </p>
                  </div>
                  <div
                    class={`px-2 py-1 rounded-full text-xs font-bold ${
                      report.healthScore >= 70
                        ? "bg-green-100 text-green-700"
                        : report.healthScore >= 40
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {report.healthScore}%
                  </div>
                </div>

                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">
                    {report.type === "observation" && "Health Check"}
                    {report.type === "analysis" && "Field Analysis"}
                    {report.type === "alert" && "Alert Generated"}
                  </span>
                  {report.alertCount > 0 && (
                    <span class="text-orange-600">
                      {report.alertCount}{" "}
                      active alert{report.alertCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ))
          )
          : (
            <div class="bg-gray-50 rounded-xl p-8 text-center">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p class="text-gray-600 font-medium">No reports yet</p>
              <p class="text-sm text-gray-500 mt-1">
                Start monitoring your farms to see reports here
              </p>
              <a
                href="/app/farm/add"
                class="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
              >
                Add Your First Farm
              </a>
            </div>
          )}
      </div>

      {/* Export Button */}
      {reports.length > 0 && (
        <div class="mt-6">
          <button
            type="button"
            class="w-full py-3 border border-gray-300 rounded-lg text-gray-700 font-medium flex items-center justify-center gap-2"
            disabled
          >
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export Report (PDF)
          </button>
        </div>
      )}
    </AppShell>
  );
}
