import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface AlertData {
  id: string;
  farmName: string;
  type: string;
  severity: string;
  title: string;
  status: string;
  createdAt: string;
}

interface AlertsPageData {
  alerts: AlertData[];
  stats: {
    total: number;
    active: number;
    resolved: number;
    critical: number;
  };
  filter: string;
}

export const handler: Handlers<AlertsPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    // Check if admin
    if (ctx.state.user.role !== "admin") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const tenantId = ctx.state.session.tenantId;

    const params: unknown[] = [tenantId];
    let filterClause = "";
    if (filter === "active") filterClause = " AND a.status = 'active'";
    else if (filter === "resolved") {
      filterClause = " AND a.status = 'resolved'";
    } else if (filter === "critical") {
      filterClause = " AND a.severity = 'critical'";
    }

    const alerts = await query<{
      id: string;
      farm_name: string;
      type: string;
      severity: string;
      title: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT a.id, f.name as farm_name, a.type, a.severity, a.title, a.status, a.created_at
       FROM alerts a
       LEFT JOIN farms f ON a.farm_id = f.id
       WHERE a.tenant_id = $1${filterClause}
       ORDER BY a.created_at DESC
       LIMIT 100`,
      params,
    );

    const statsResult = await query<{
      total: number;
      active: number;
      resolved: number;
      critical: number;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical
       FROM alerts WHERE tenant_id = $1`,
      [tenantId],
    );

    const stats = statsResult[0] ||
      { total: 0, active: 0, resolved: 0, critical: 0 };

    return ctx.render({
      alerts: alerts.map((a) => ({
        id: a.id,
        farmName: a.farm_name || "Unknown",
        type: a.type,
        severity: a.severity,
        title: a.title || "Alert",
        status: a.status,
        createdAt: new Date(a.created_at).toLocaleString("en-IN"),
      })),
      stats: {
        total: Number(stats.total),
        active: Number(stats.active),
        resolved: Number(stats.resolved),
        critical: Number(stats.critical),
      },
      filter,
    });
  },
};

export default function AdminAlertsPage({ data }: PageProps<AlertsPageData>) {
  const { alerts, stats, filter } = data;

  const severityColors: Record<string, string> = {
    low: "bg-blue-100 text-blue-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    acknowledged: "bg-blue-100 text-blue-700",
    resolved: "bg-gray-100 text-gray-700",
  };

  return (
    <AdminLayout title="Alert Management" currentPage="alerts">
      <div class="max-w-7xl mx-auto">
        {/* Stats */}
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <p class="text-sm text-gray-500">Total Alerts</p>
            <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <p class="text-sm text-gray-500">Active</p>
            <p class="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <p class="text-sm text-gray-500">Resolved</p>
            <p class="text-2xl font-bold text-gray-600">{stats.resolved}</p>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <p class="text-sm text-gray-500">Critical</p>
            <p class="text-2xl font-bold text-red-600">{stats.critical}</p>
          </div>
        </div>

        {/* Filters */}
        <div class="flex gap-2 mb-4">
          {["all", "active", "resolved", "critical"].map((f) => (
            <a
              key={f}
              href={`/admin/alerts?filter=${f}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                filter === f
                  ? "bg-primary-600 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </a>
          ))}
        </div>

        {/* Alerts Table */}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Farm
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Severity
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Title
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {alerts.length > 0
                ? (
                  alerts.map((alert) => (
                    <tr key={alert.id} class="hover:bg-gray-50">
                      <td class="px-4 py-3 text-sm text-gray-900">
                        {alert.farmName}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600 capitalize">
                        {alert.type}
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class={`px-2 py-1 rounded text-xs font-medium ${
                            severityColors[alert.severity] || "bg-gray-100"
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-900">
                        {alert.title}
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class={`px-2 py-1 rounded text-xs font-medium ${
                            statusColors[alert.status] || "bg-gray-100"
                          }`}
                        >
                          {alert.status}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-500">
                        {alert.createdAt}
                      </td>
                    </tr>
                  ))
                )
                : (
                  <tr>
                    <td
                      colSpan={6}
                      class="px-4 py-8 text-center text-gray-500"
                    >
                      No alerts found
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
