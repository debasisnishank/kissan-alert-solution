import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface FarmDetail {
  id: string;
  name: string;
  farmerName: string;
  farmerPhone: string;
  farmerId: string;
  district: string;
  state: string;
  village: string;
  areaHectares: number;
  soilType: string;
  waterSource: string;
  isVerified: boolean;
  createdAt: string;
  crop: {
    type: string;
    variety: string;
    sowingDate: string;
    season: string;
  } | null;
  healthScore: number | null;
  observations: {
    date: string;
    ndvi: number;
    healthScore: number;
  }[];
}

export const handler: Handlers<FarmDetail | null, AuthState> = {
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
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    const farmId = ctx.params.id;

    const farm = await queryOne<{
      id: string;
      name: string;
      farmer_name: string;
      farmer_phone: string;
      farmer_id: string;
      district: string;
      state: string;
      village: string;
      area_hectares: number;
      soil_type: string;
      water_source: string;
      is_verified: boolean;
      created_at: Date;
    }>(
      `SELECT 
        f.id, f.name, u.name as farmer_name, u.phone as farmer_phone, u.id as farmer_id,
        f.district, f.state, f.village, f.area_hectares, f.soil_type, f.water_source,
        f.is_verified, f.created_at
       FROM farms f
       JOIN users u ON f.farmer_id = u.id
       WHERE f.id = $1 AND f.tenant_id = $2`,
      [farmId, session.tenantId],
    );

    if (!farm) {
      return ctx.render(null);
    }

    const [cropResult, observations] = await Promise.all([
      queryOne<{
        crop_type: string;
        variety: string;
        sowing_date: Date;
        season: string;
      }>(
        `SELECT crop_type, variety, sowing_date, season
         FROM crop_declarations WHERE farm_id = $1 AND is_active = true`,
        [farmId],
      ),
      query<{
        observation_date: Date;
        ndvi: number;
        health_score: number;
      }>(
        `SELECT observation_date, ndvi, health_score
         FROM farm_observations WHERE farm_id = $1
         ORDER BY observation_date DESC LIMIT 30`,
        [farmId],
      ),
    ]);

    const latestObs = observations[0];

    return ctx.render({
      id: farm.id,
      name: farm.name,
      farmerName: farm.farmer_name,
      farmerPhone: farm.farmer_phone,
      farmerId: farm.farmer_id,
      district: farm.district || "N/A",
      state: farm.state || "N/A",
      village: farm.village || "N/A",
      areaHectares: farm.area_hectares,
      soilType: farm.soil_type || "N/A",
      waterSource: farm.water_source || "N/A",
      isVerified: farm.is_verified,
      createdAt: farm.created_at.toISOString(),
      crop: cropResult
        ? {
          type: cropResult.crop_type,
          variety: cropResult.variety || "N/A",
          sowingDate: cropResult.sowing_date.toLocaleDateString("en-IN"),
          season: cropResult.season,
        }
        : null,
      healthScore: latestObs ? Number(latestObs.health_score) : null,
      observations: observations.map((o) => ({
        date: o.observation_date.toLocaleDateString("en-IN"),
        // NUMERIC columns arrive as strings from deno-postgres
        ndvi: Number(o.ndvi),
        healthScore: Number(o.health_score),
      })),
    });
  },
};

export default function AdminFarmDetailPage(
  { data }: PageProps<FarmDetail | null>,
) {
  if (!data) {
    return (
      <AdminLayout title="Farm Not Found" currentPage="farms">
        <div class="flex items-center justify-center min-h-[50vh]">
          <div class="text-center">
            <h1 class="text-2xl font-bold text-gray-900 mb-2">
              Farm Not Found
            </h1>
            <p class="text-gray-500 mb-4">
              The farm you're looking for doesn't exist.
            </p>
            <a href="/admin/farms" class="text-primary-600 hover:underline">
              Back to Farms
            </a>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const farm = data;

  return (
    <AdminLayout title={`Farm: ${farm.name}`} currentPage="farms">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Farm Info */}
          <div class="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div class="bg-white rounded-xl border p-6">
              <h2 class="font-semibold text-gray-900 mb-4">Farm Details</h2>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-sm text-gray-500">Area</p>
                  <p class="font-medium">{farm.areaHectares} hectares</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Soil Type</p>
                  <p class="font-medium capitalize">
                    {farm.soilType.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Water Source</p>
                  <p class="font-medium capitalize">{farm.waterSource}</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">State</p>
                  <p class="font-medium">{farm.state}</p>
                </div>
              </div>
            </div>

            {/* Current Crop */}
            {farm.crop && (
              <div class="bg-white rounded-xl border p-6">
                <h2 class="font-semibold text-gray-900 mb-4">Active Crop</h2>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-sm text-gray-500">Crop Type</p>
                    <p class="font-medium capitalize">{farm.crop.type}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Variety</p>
                    <p class="font-medium">{farm.crop.variety}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Sowing Date</p>
                    <p class="font-medium">{farm.crop.sowingDate}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Season</p>
                    <p class="font-medium capitalize">{farm.crop.season}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Observations */}
            {farm.observations.length > 0 && (
              <div class="bg-white rounded-xl border p-6">
                <h2 class="font-semibold text-gray-900 mb-4">
                  Recent Observations
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b">
                        <th class="text-left py-2 text-gray-500 font-medium">
                          Date
                        </th>
                        <th class="text-left py-2 text-gray-500 font-medium">
                          NDVI
                        </th>
                        <th class="text-left py-2 text-gray-500 font-medium">
                          Health Score
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {farm.observations.map((obs, i) => (
                        <tr key={i} class="border-b last:border-0">
                          <td class="py-2">{obs.date}</td>
                          <td class="py-2">{obs.ndvi.toFixed(3)}</td>
                          <td class="py-2">
                            <span
                              class={`px-2 py-0.5 rounded text-xs font-medium ${
                                obs.healthScore >= 70
                                  ? "bg-green-100 text-green-700"
                                  : obs.healthScore >= 50
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {obs.healthScore}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Farmer & Actions */}
          <div class="space-y-6">
            {/* Farmer Info */}
            <div class="bg-white rounded-xl border p-6">
              <h2 class="font-semibold text-gray-900 mb-4">Farmer</h2>
              <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <span class="text-lg font-bold text-primary-600">
                    {farm.farmerName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-gray-900">{farm.farmerName}</p>
                  <p class="text-sm text-gray-500">{farm.farmerPhone}</p>
                </div>
              </div>
              <a
                href={`/admin/users?id=${farm.farmerId}`}
                class="text-sm text-primary-600 hover:underline"
              >
                View Farmer Profile →
              </a>
            </div>

            {/* Health Score */}
            <div class="bg-white rounded-xl border p-6">
              <h2 class="font-semibold text-gray-900 mb-4">Health Score</h2>
              {farm.healthScore
                ? (
                  <div class="text-center">
                    <div
                      class={`text-4xl font-bold ${
                        farm.healthScore >= 70
                          ? "text-green-600"
                          : farm.healthScore >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {farm.healthScore}%
                    </div>
                    <p class="text-sm text-gray-500 mt-1">
                      {farm.healthScore >= 70
                        ? "Healthy"
                        : farm.healthScore >= 50
                        ? "Moderate"
                        : "Needs Attention"}
                    </p>
                  </div>
                )
                : <p class="text-gray-500 text-sm">No data available</p>}
            </div>

            {/* Quick Actions */}
            <div class="bg-white rounded-xl border p-6">
              <h2 class="font-semibold text-gray-900 mb-4">Actions</h2>
              <div class="space-y-2">
                <a
                  href={`/app/farm/${farm.id}`}
                  class="block w-full py-2 px-4 bg-primary-600 text-white text-center rounded-lg hover:bg-primary-700"
                >
                  View as Farmer
                </a>
                {!farm.isVerified && (
                  <form
                    action={`/api/admin/farms/${farm.id}/verify`}
                    method="POST"
                  >
                    <button
                      type="submit"
                      class="w-full py-2 px-4 border border-green-600 text-green-600 rounded-lg hover:bg-green-50"
                    >
                      Verify Farm
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div class="text-xs text-gray-400">
              <p>Farm ID: {farm.id}</p>
              <p>
                Created: {new Date(farm.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
