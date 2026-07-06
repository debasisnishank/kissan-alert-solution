import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";
import { ALERT_TYPES, CROP_CATEGORIES } from "$utils/constants.ts";

interface CreateAlertPageData {
  farms: Array<
    { id: string; name: string; district: string; cropType: string }
  >;
  districts: string[];
  error?: string;
  success?: boolean;
}

export const handler: Handlers<CreateAlertPageData, AuthState> = {
  async GET(_req, ctx) {
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

    const [farms, districts] = await Promise.all([
      query<{ id: string; name: string; district: string; crop_type: string }>(
        `SELECT f.id, f.name, f.district, COALESCE(fc.crop_type, 'unknown') as crop_type
         FROM farms f
         LEFT JOIN farm_crops fc ON fc.farm_id = f.id AND fc.is_active = true
         WHERE f.tenant_id = $1 AND f.is_active = true
         ORDER BY f.name`,
        [tenantId],
      ),
      query<{ district: string }>(
        `SELECT DISTINCT district FROM farms WHERE tenant_id = $1 AND district IS NOT NULL ORDER BY district`,
        [tenantId],
      ),
    ]);

    return ctx.render({
      farms: farms.map((f) => ({
        id: f.id,
        name: f.name,
        district: f.district || "Unknown",
        cropType: f.crop_type,
      })),
      districts: districts.map((d) => d.district),
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) return new Response(null, { status: 401 });

    const tenantId = ctx.state.session.tenantId;
    const formData = await req.formData();

    const title = formData.get("title") as string;
    const message = formData.get("message") as string;
    const type = formData.get("type") as string;
    const severity = formData.get("severity") as string;
    const targetType = formData.get("target_type") as string;
    const expiresInDays = parseInt(formData.get("expires_in_days") as string) ||
      7;

    if (!title || !message || !type || !severity) {
      const [farms, districts] = await Promise.all([
        query<
          { id: string; name: string; district: string; crop_type: string }
        >(
          `SELECT f.id, f.name, f.district, COALESCE(fc.crop_type, 'unknown') as crop_type
           FROM farms f
           LEFT JOIN farm_crops fc ON fc.farm_id = f.id AND fc.is_active = true
           WHERE f.tenant_id = $1 AND f.is_active = true
           ORDER BY f.name`,
          [tenantId],
        ),
        query<{ district: string }>(
          `SELECT DISTINCT district FROM farms WHERE tenant_id = $1 AND district IS NOT NULL`,
          [tenantId],
        ),
      ]);
      return ctx.render({
        farms: farms.map((f) => ({
          id: f.id,
          name: f.name,
          district: f.district || "Unknown",
          cropType: f.crop_type,
        })),
        districts: districts.map((d) => d.district),
        error: "All fields are required",
      });
    }

    // Determine target farms based on selection
    let targetFarmIds: string[] = [];

    if (targetType === "all") {
      const farms = await query<{ id: string }>(
        `SELECT id FROM farms WHERE tenant_id = $1 AND is_active = true`,
        [tenantId],
      );
      targetFarmIds = farms.map((f) => f.id);
    } else if (targetType === "district") {
      const districts = formData.getAll("districts") as string[];
      if (districts.length > 0) {
        const farms = await query<{ id: string }>(
          `SELECT id FROM farms WHERE tenant_id = $1 AND district = ANY($2) AND is_active = true`,
          [tenantId, districts],
        );
        targetFarmIds = farms.map((f) => f.id);
      }
    } else if (targetType === "crop") {
      const crops = formData.getAll("crops") as string[];
      if (crops.length > 0) {
        const farms = await query<{ id: string }>(
          `SELECT DISTINCT f.id FROM farms f
           JOIN farm_crops fc ON fc.farm_id = f.id
           WHERE f.tenant_id = $1 AND fc.crop_type = ANY($2) AND fc.is_active = true AND f.is_active = true`,
          [tenantId, crops],
        );
        targetFarmIds = farms.map((f) => f.id);
      }
    } else if (targetType === "selected") {
      targetFarmIds = formData.getAll("farm_ids") as string[];
    }

    if (targetFarmIds.length === 0) {
      const [farms, districts] = await Promise.all([
        query<
          { id: string; name: string; district: string; crop_type: string }
        >(
          `SELECT f.id, f.name, f.district, COALESCE(fc.crop_type, 'unknown') as crop_type
           FROM farms f
           LEFT JOIN farm_crops fc ON fc.farm_id = f.id AND fc.is_active = true
           WHERE f.tenant_id = $1 AND f.is_active = true
           ORDER BY f.name`,
          [tenantId],
        ),
        query<{ district: string }>(
          `SELECT DISTINCT district FROM farms WHERE tenant_id = $1 AND district IS NOT NULL`,
          [tenantId],
        ),
      ]);
      return ctx.render({
        farms: farms.map((f) => ({
          id: f.id,
          name: f.name,
          district: f.district || "Unknown",
          cropType: f.crop_type,
        })),
        districts: districts.map((d) => d.district),
        error: "No farms matched the selected criteria",
      });
    }

    // Create alerts for all target farms
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    for (const farmId of targetFarmIds) {
      await execute(
        `INSERT INTO alerts (id, tenant_id, farm_id, type, severity, title, description, status, expires_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'active', $7)`,
        [tenantId, farmId, type, severity, title, message, expiresAt],
      );
    }

    // Log the action
    await execute(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES (gen_random_uuid(), $1, $2, 'bulk_create', 'alert', NULL, $3)`,
      [
        tenantId,
        ctx.state.session.userId,
        JSON.stringify({ count: targetFarmIds.length, type, severity }),
      ],
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location:
          `/admin/alerts?success=Created ${targetFarmIds.length} alerts`,
      },
    });
  },
};

export default function CreateAlertPage(
  { data }: PageProps<CreateAlertPageData>,
) {
  const alertTypes = Object.values(ALERT_TYPES);
  const severities = ["low", "medium", "high", "critical"];

  return (
    <AdminLayout title="Create Bulk Alert" currentPage="alerts">
      <div class="max-w-3xl mx-auto">
        {data.error && (
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {data.error}
          </div>
        )}

        <form method="POST" class="bg-white rounded-lg border p-6 space-y-6">
          {/* Alert Content */}
          <div>
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Alert Content
            </h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Heavy Rainfall Expected"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  name="message"
                  required
                  rows={3}
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Detailed advisory message..."
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Type *
                  </label>
                  <select
                    name="type"
                    required
                    class="w-full px-4 py-2 border rounded-lg"
                  >
                    {alertTypes.map((t) => (
                      <option key={t} value={t} class="capitalize">
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Severity *
                  </label>
                  <select
                    name="severity"
                    required
                    class="w-full px-4 py-2 border rounded-lg"
                  >
                    {severities.map((s) => (
                      <option key={s} value={s} class="capitalize">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Expires In (days)
                </label>
                <input
                  type="number"
                  name="expires_in_days"
                  defaultValue={7}
                  min={1}
                  max={30}
                  class="w-32 px-4 py-2 border rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Target Selection */}
          <div>
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Target Farms
            </h2>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <label class="flex items-center gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="target_type"
                    value="all"
                    class="text-primary-600"
                    defaultChecked
                  />
                  <div>
                    <p class="font-medium text-gray-900">All Farms</p>
                    <p class="text-sm text-gray-500">
                      Send to all {data.farms.length} farms
                    </p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="target_type"
                    value="district"
                    class="text-primary-600"
                  />
                  <div>
                    <p class="font-medium text-gray-900">By District</p>
                    <p class="text-sm text-gray-500">
                      Filter by location
                    </p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="target_type"
                    value="crop"
                    class="text-primary-600"
                  />
                  <div>
                    <p class="font-medium text-gray-900">By Crop</p>
                    <p class="text-sm text-gray-500">
                      Filter by crop type
                    </p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="target_type"
                    value="selected"
                    class="text-primary-600"
                  />
                  <div>
                    <p class="font-medium text-gray-900">Select Farms</p>
                    <p class="text-sm text-gray-500">
                      Choose individually
                    </p>
                  </div>
                </label>
              </div>

              {/* District Selection */}
              <div id="district-selection" class="p-4 bg-gray-50 rounded-lg">
                <p class="text-sm font-medium text-gray-700 mb-2">
                  Select Districts:
                </p>
                <div class="flex flex-wrap gap-2">
                  {data.districts.map((d) => (
                    <label
                      key={d}
                      class="flex items-center gap-2 px-3 py-1 bg-white border rounded-full text-sm"
                    >
                      <input
                        type="checkbox"
                        name="districts"
                        value={d}
                        class="rounded"
                      />
                      {d}
                    </label>
                  ))}
                  {data.districts.length === 0 && (
                    <p class="text-gray-500 text-sm">No districts found</p>
                  )}
                </div>
              </div>

              {/* Crop Selection */}
              <div id="crop-selection" class="p-4 bg-gray-50 rounded-lg">
                <p class="text-sm font-medium text-gray-700 mb-2">
                  Select Crops:
                </p>
                <div class="flex flex-wrap gap-2">
                  {CROP_CATEGORIES.slice(0, 4).flatMap((cat) =>
                    cat.crops.slice(0, 5).map((crop) => (
                      <label
                        key={crop.id}
                        class="flex items-center gap-2 px-3 py-1 bg-white border rounded-full text-sm"
                      >
                        <input
                          type="checkbox"
                          name="crops"
                          value={crop.id}
                          class="rounded"
                        />
                        {crop.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Farm Selection */}
              <div id="farm-selection" class="p-4 bg-gray-50 rounded-lg">
                <p class="text-sm font-medium text-gray-700 mb-2">
                  Select Farms ({data.farms.length} available):
                </p>
                <div class="max-h-48 overflow-y-auto space-y-1">
                  {data.farms.map((farm) => (
                    <label
                      key={farm.id}
                      class="flex items-center gap-3 p-2 bg-white rounded hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        name="farm_ids"
                        value={farm.id}
                        class="rounded"
                      />
                      <div class="flex-1">
                        <p class="text-sm font-medium text-gray-900">
                          {farm.name}
                        </p>
                        <p class="text-xs text-gray-500">
                          {farm.district} - {farm.cropType}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <a
              href="/admin/alerts"
              class="flex-1 py-2 border rounded-lg text-center font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              class="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
            >
              Send Alerts
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
