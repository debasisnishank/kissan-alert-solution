import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface SyncPageData {
  stats: {
    totalFarms: number;
    observationsToday: number;
    satelliteProducts: number;
    pendingJobs: number;
    failedJobs: number;
  };
  recentJobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    error: string | null;
  }>;
  lastSync: {
    satellite: string | null;
    market: string | null;
    features: string | null;
  };
}

export const handler: Handlers<SyncPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const allowedRoles = ["admin", "tenant_admin"];
    if (!allowedRoles.includes(session.role)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    const tenantId = session.tenantId;

    // Get stats
    const [farmCount, obsCount, productCount, pendingCount, failedCount] =
      await Promise.all([
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM farms WHERE tenant_id = $1 AND is_active = true`,
          [tenantId],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM farm_observations fo
           JOIN farms f ON fo.farm_id = f.id
           WHERE f.tenant_id = $1 AND fo.observation_date >= CURRENT_DATE`,
          [tenantId],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM satellite_products
           WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,
          [],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`,
          [],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) as count FROM jobs WHERE status = 'failed'`,
          [],
        ),
      ]);

    // Get recent jobs
    const jobs = await query<{
      id: string;
      type: string;
      status: string;
      created_at: Date;
      completed_at: Date | null;
      error: string | null;
    }>(
      `SELECT id, type, status, created_at, completed_at, error
       FROM jobs
       ORDER BY created_at DESC
       LIMIT 20`,
      [],
    );

    // Get last sync times
    const lastSatellite = await query<{ completed_at: Date }>(
      `SELECT completed_at FROM jobs
       WHERE type = 'ingest_satellite_catalog' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [],
    );

    const lastMarket = await query<{ completed_at: Date }>(
      `SELECT completed_at FROM jobs
       WHERE type = 'sync_market_prices' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [],
    );

    const lastFeatures = await query<{ completed_at: Date }>(
      `SELECT completed_at FROM jobs
       WHERE type = 'extract_farm_features' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [],
    );

    return ctx.render({
      stats: {
        totalFarms: Number(farmCount[0]?.count || 0),
        observationsToday: Number(obsCount[0]?.count || 0),
        satelliteProducts: Number(productCount[0]?.count || 0),
        pendingJobs: Number(pendingCount[0]?.count || 0),
        failedJobs: Number(failedCount[0]?.count || 0),
      },
      recentJobs: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        createdAt: new Date(j.created_at).toLocaleString("en-IN"),
        completedAt: j.completed_at
          ? new Date(j.completed_at).toLocaleString("en-IN")
          : null,
        error: j.error,
      })),
      lastSync: {
        satellite: lastSatellite[0]?.completed_at
          ? new Date(lastSatellite[0].completed_at).toLocaleString("en-IN")
          : null,
        market: lastMarket[0]?.completed_at
          ? new Date(lastMarket[0].completed_at).toLocaleString("en-IN")
          : null,
        features: lastFeatures[0]?.completed_at
          ? new Date(lastFeatures[0].completed_at).toLocaleString("en-IN")
          : null,
      },
    });
  },
};

export default function AdminSyncPage({ data }: PageProps<SyncPageData>) {
  const { stats, recentJobs, lastSync } = data;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const jobTypeLabels: Record<string, string> = {
    ingest_satellite_catalog: "Satellite Catalog",
    extract_farm_features: "Farm Features",
    generate_advisories: "Advisories",
    sync_market_prices: "Market Prices",
  };

  return (
    <AdminLayout title="Data Sync" currentPage="sync">
      <div class="max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Active Farms</p>
            <p class="text-2xl font-bold text-gray-900">{stats.totalFarms}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Observations Today</p>
            <p class="text-2xl font-bold text-gray-900">
              {stats.observationsToday}
            </p>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Satellite Products</p>
            <p class="text-2xl font-bold text-gray-900">
              {stats.satelliteProducts}
            </p>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Pending Jobs</p>
            <p class="text-2xl font-bold text-yellow-600">
              {stats.pendingJobs}
            </p>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Failed Jobs</p>
            <p class="text-2xl font-bold text-red-600">{stats.failedJobs}</p>
          </div>
        </div>

        {/* Sync Actions */}
        <div class="bg-white rounded-lg shadow p-6 mb-8">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Manual Sync Actions
          </h2>

          <div class="grid md:grid-cols-4 gap-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-medium text-gray-900">Satellite Catalog</h3>
              <p class="text-xs text-gray-500 mb-2">
                Last: {lastSync.satellite || "Never"}
              </p>
              <form action="/api/jobs/schedule" method="POST">
                <input
                  type="hidden"
                  name="jobType"
                  value="ingest_satellite"
                />
                <button
                  type="submit"
                  class="w-full bg-primary-600 text-white py-2 rounded text-sm font-medium hover:bg-primary-700"
                >
                  Sync Now
                </button>
              </form>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium text-gray-900">Farm Features</h3>
              <p class="text-xs text-gray-500 mb-2">
                Last: {lastSync.features || "Never"}
              </p>
              <form action="/api/jobs/schedule" method="POST">
                <input type="hidden" name="jobType" value="sync_all_farms" />
                <button
                  type="submit"
                  class="w-full bg-primary-600 text-white py-2 rounded text-sm font-medium hover:bg-primary-700"
                >
                  Extract All
                </button>
              </form>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium text-gray-900">Market Prices</h3>
              <p class="text-xs text-gray-500 mb-2">
                Last: {lastSync.market || "Never"}
              </p>
              <form action="/api/jobs/schedule" method="POST">
                <input
                  type="hidden"
                  name="jobType"
                  value="sync_market_prices"
                />
                <button
                  type="submit"
                  class="w-full bg-primary-600 text-white py-2 rounded text-sm font-medium hover:bg-primary-700"
                >
                  Sync Prices
                </button>
              </form>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium text-gray-900">Generate Advisories</h3>
              <p class="text-xs text-gray-500 mb-2">
                Create alerts for all farms
              </p>
              <form action="/api/jobs/schedule" method="POST">
                <input
                  type="hidden"
                  name="jobType"
                  value="generate_advisories"
                />
                <button
                  type="submit"
                  class="w-full bg-orange-600 text-white py-2 rounded text-sm font-medium hover:bg-orange-700"
                >
                  Generate
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold text-gray-900">Recent Jobs</h2>
          </div>
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Completed
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Error
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {recentJobs.map((job) => (
                <tr key={job.id} class="hover:bg-gray-50">
                  <td class="px-6 py-4 text-sm text-gray-900">
                    {jobTypeLabels[job.type] || job.type}
                  </td>
                  <td class="px-6 py-4">
                    <span
                      class={`px-2 py-1 text-xs font-medium rounded-full ${
                        statusColors[job.status] || "bg-gray-100"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {job.createdAt}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {job.completedAt || "-"}
                  </td>
                  <td class="px-6 py-4 text-sm text-red-600 max-w-xs truncate">
                    {job.error || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
