import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface FarmData {
  id: string;
  name: string;
  farmerName: string;
  district: string;
  areaHectares: number;
  cropType: string | null;
  healthScore: number | null;
  isVerified: boolean;
  createdAt: string;
}

interface AdminFarmsPageData {
  farms: FarmData[];
  total: number;
  page: number;
  limit: number;
}

export const handler: Handlers<AdminFarmsPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const allowedRoles = ["admin", "tenant_admin", "extension_officer"];
    if (!allowedRoles.includes(session.role)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;
    const tenantId = session.tenantId;

    const [farms, countResult] = await Promise.all([
      query<{
        id: string;
        name: string;
        farmer_name: string;
        district: string | null;
        area_hectares: number;
        crop_type: string | null;
        health_score: number | null;
        is_verified: boolean;
        created_at: Date;
      }>(
        `SELECT 
          f.id, f.name, u.name as farmer_name, f.district, f.area_hectares,
          cd.crop_type, fo.health_score, f.is_verified, f.created_at
         FROM farms f
         JOIN users u ON f.farmer_id = u.id
         LEFT JOIN crop_declarations cd ON cd.farm_id = f.id AND cd.is_active = true
         LEFT JOIN LATERAL (
           SELECT health_score FROM farm_observations 
           WHERE farm_id = f.id ORDER BY observation_date DESC LIMIT 1
         ) fo ON true
         WHERE f.tenant_id = $1
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) as count FROM farms WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    return ctx.render({
      farms: farms.map((f) => ({
        id: f.id,
        name: f.name,
        farmerName: f.farmer_name,
        district: f.district || "N/A",
        areaHectares: Number(f.area_hectares),
        cropType: f.crop_type,
        healthScore: f.health_score ? Number(f.health_score) : null,
        isVerified: f.is_verified,
        createdAt: new Date(f.created_at).toLocaleDateString("en-IN"),
      })),
      total: Number(countResult[0]?.count || 0),
      page,
      limit,
    });
  },
};

export default function AdminFarmsPage(
  { data }: PageProps<AdminFarmsPageData>,
) {
  const { farms, total, page, limit } = data;
  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title="Farms Management" currentPage="farms">
      <div class="max-w-7xl mx-auto">
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Farm
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Farmer
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Area
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Crop
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Health
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {farms.map((farm) => (
                <tr key={farm.id} class="hover:bg-gray-50">
                  <td class="px-6 py-4">
                    <a
                      href={`/admin/farms/${farm.id}`}
                      class="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {farm.name}
                    </a>
                    <p class="text-xs text-gray-500">{farm.createdAt}</p>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900">
                    {farm.farmerName}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {farm.district}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900">
                    {farm.areaHectares.toFixed(2)} ha
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900 capitalize">
                    {farm.cropType || "-"}
                  </td>
                  <td class="px-6 py-4">
                    {farm.healthScore !== null
                      ? (
                        <span
                          class={`px-2 py-1 text-xs font-medium rounded-full ${
                            farm.healthScore >= 75
                              ? "bg-green-100 text-green-800"
                              : farm.healthScore >= 50
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {farm.healthScore.toFixed(0)}%
                        </span>
                      )
                      : <span class="text-gray-400">-</span>}
                  </td>
                  <td class="px-6 py-4">
                    {farm.isVerified
                      ? (
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Verified
                        </span>
                      )
                      : (
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p class="text-sm text-gray-500">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, total)} of {total}
              </p>
              <div class="flex gap-2">
                {page > 1 && (
                  <a
                    href={`/admin/farms?page=${page - 1}`}
                    class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    Previous
                  </a>
                )}
                {page < totalPages && (
                  <a
                    href={`/admin/farms?page=${page + 1}`}
                    class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
