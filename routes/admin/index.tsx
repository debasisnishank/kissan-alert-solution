import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface AdminDashboardData {
  stats: {
    totalFarmers: number;
    totalFarms: number;
    totalAlerts: number;
    activeAlerts: number;
    totalArea: number;
  };
  recentAlerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    farmName: string;
    createdAt: string;
  }>;
}

export const handler: Handlers<AdminDashboardData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const allowedRoles = ["admin", "tenant_admin", "extension_officer"];
    if (!allowedRoles.includes(session.role)) {
      return new Response(null, { status: 302, headers: { Location: "/app" } });
    }

    const tenantId = session.tenantId;

    const [farmersResult, farmsResult, alertsResult, areaResult, recentAlerts] =
      await Promise.all([
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND role = 'farmer'`,
          [tenantId],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM farms WHERE tenant_id = $1`,
          [tenantId],
        ),
        query<{ total: number; active: number }>(
          `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active
         FROM alerts WHERE tenant_id = $1`,
          [tenantId],
        ),
        query<{ total: number }>(
          `SELECT COALESCE(SUM(area_hectares), 0) as total FROM farms WHERE tenant_id = $1`,
          [tenantId],
        ),
        query<{
          id: string;
          type: string;
          severity: string;
          title: string;
          farm_name: string;
          created_at: Date;
        }>(
          `SELECT a.id, a.type, a.severity, a.title, f.name as farm_name, a.created_at
         FROM alerts a
         JOIN farms f ON a.farm_id = f.id
         WHERE a.tenant_id = $1
         ORDER BY a.created_at DESC
         LIMIT 10`,
          [tenantId],
        ),
      ]);

    return ctx.render({
      stats: {
        totalFarmers: Number(farmersResult[0]?.count ?? 0),
        totalFarms: Number(farmsResult[0]?.count ?? 0),
        totalAlerts: Number(alertsResult[0]?.total ?? 0),
        activeAlerts: Number(alertsResult[0]?.active ?? 0),
        totalArea: Number(areaResult[0]?.total ?? 0),
      },
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        farmName: a.farm_name,
        createdAt: new Date(a.created_at).toLocaleString("en-IN"),
      })),
    });
  },
};

export default function AdminDashboard(
  { data }: PageProps<AdminDashboardData>,
) {
  const { stats, recentAlerts } = data;

  return (
    <AdminLayout title="Dashboard" currentPage="dashboard">
      <div class="max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            title="Total Farmers"
            value={stats.totalFarmers}
            icon="users"
          />
          <StatCard
            title="Total Farms"
            value={stats.totalFarms}
            icon="farm"
          />
          <StatCard
            title="Total Area"
            value={`${stats.totalArea.toFixed(0)} ha`}
            icon="area"
          />
          <StatCard
            title="Active Alerts"
            value={stats.activeAlerts}
            icon="alert"
            color="orange"
          />
          <StatCard
            title="Total Alerts"
            value={stats.totalAlerts}
            icon="history"
          />
        </div>

        {/* Recent Alerts */}
        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">Recent Alerts</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Severity
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Farm
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                {recentAlerts.map((alert) => (
                  <tr key={alert.id} class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm capitalize">
                      {alert.type}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <span
                        class={`px-2 py-1 text-xs font-medium rounded-full ${
                          alert.severity === "critical"
                            ? "bg-red-100 text-red-800"
                            : alert.severity === "high"
                            ? "bg-orange-100 text-orange-800"
                            : alert.severity === "medium"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                      {alert.title}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {alert.farmName}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {alert.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard(
  { title, value, icon, color = "primary" }: {
    title: string;
    value: string | number;
    icon: string;
    color?: string;
  },
) {
  const colors = {
    primary: "bg-primary-100 text-primary-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex items-center gap-4">
        <div
          class={`p-3 rounded-lg ${
            colors[color as keyof typeof colors] || colors.primary
          }`}
        >
          <StatIcon type={icon} />
        </div>
        <div>
          <p class="text-sm text-gray-500">{title}</p>
          <p class="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatIcon({ type }: { type: string }) {
  const icons: Record<string, preact.JSX.Element> = {
    users: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
    farm: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
        />
      </svg>
    ),
    area: (
      <svg
        class="w-6 h-6"
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
    ),
    alert: (
      <svg
        class="w-6 h-6"
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
    ),
    history: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };
  return icons[type] || null;
}
