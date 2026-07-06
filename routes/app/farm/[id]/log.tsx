import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getFarmById } from "$lib/farm.ts";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

interface ActivityLog {
  id: string;
  activityType: string;
  description: string;
  quantity?: number;
  unit?: string;
  cost?: number;
  notes?: string;
  activityDate: string;
  createdAt: string;
}

interface ActivityLogPageData {
  farm: { id: string; name: string };
  logs: ActivityLog[];
  success?: string;
}

const ACTIVITY_TYPES = [
  { id: "irrigation", label: "Irrigation", icon: "💧", color: "blue" },
  {
    id: "fertilizer",
    label: "Fertilizer Application",
    icon: "🧪",
    color: "purple",
  },
  { id: "pesticide", label: "Pesticide/Herbicide", icon: "🔬", color: "red" },
  { id: "sowing", label: "Sowing/Planting", icon: "🌱", color: "green" },
  { id: "harvest", label: "Harvesting", icon: "🌾", color: "yellow" },
  { id: "weeding", label: "Weeding", icon: "🌿", color: "lime" },
  { id: "plowing", label: "Plowing/Tilling", icon: "🚜", color: "orange" },
  { id: "pruning", label: "Pruning", icon: "✂️", color: "pink" },
  { id: "soil_test", label: "Soil Testing", icon: "🧫", color: "amber" },
  { id: "observation", label: "Field Observation", icon: "👁️", color: "gray" },
  { id: "purchase", label: "Input Purchase", icon: "🛒", color: "cyan" },
  { id: "labor", label: "Labor Work", icon: "👷", color: "indigo" },
  { id: "other", label: "Other", icon: "📝", color: "slate" },
];

export const handler: Handlers<ActivityLogPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params;
    const { session } = ctx.state;
    const url = new URL(req.url);
    const success = url.searchParams.get("success");

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    const logs = await query<{
      id: string;
      activity_type: string;
      description: string;
      quantity: number | null;
      unit: string | null;
      cost: number | null;
      notes: string | null;
      activity_date: Date;
      created_at: Date;
    }>(
      `SELECT id, activity_type, description, quantity, unit, cost, notes, activity_date, created_at
       FROM farm_activity_logs
       WHERE farm_id = $1
       ORDER BY activity_date DESC, created_at DESC
       LIMIT 100`,
      [id],
    );

    return ctx.render({
      farm: { id: farm.id, name: farm.name },
      logs: logs.map((l) => ({
        id: l.id,
        activityType: l.activity_type,
        description: l.description,
        quantity: l.quantity ?? undefined,
        unit: l.unit ?? undefined,
        cost: l.cost ? Number(l.cost) : undefined,
        notes: l.notes ?? undefined,
        activityDate: new Date(l.activity_date).toISOString().split("T")[0],
        createdAt: new Date(l.created_at).toLocaleString("en-IN"),
      })),
      success: success || undefined,
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) return new Response(null, { status: 401 });

    const { id } = ctx.params;
    const formData = await req.formData();

    const activityType = formData.get("activity_type") as string;
    const description = formData.get("description") as string;
    const activityDate = formData.get("activity_date") as string;
    const quantity = formData.get("quantity") as string;
    const unit = formData.get("unit") as string;
    const cost = formData.get("cost") as string;
    const notes = formData.get("notes") as string;

    if (!activityType || !description || !activityDate) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/app/farm/${id}/log?error=missing_fields` },
      });
    }

    await execute(
      `INSERT INTO farm_activity_logs (id, farm_id, activity_type, description, quantity, unit, cost, notes, activity_date, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        activityType,
        description,
        quantity ? parseFloat(quantity) : null,
        unit || null,
        cost ? parseFloat(cost) : null,
        notes || null,
        activityDate,
        ctx.state.session.userId,
      ],
    );

    return new Response(null, {
      status: 302,
      headers: { Location: `/app/farm/${id}/log?success=added` },
    });
  },
};

export default function ActivityLogPage(
  { data }: PageProps<ActivityLogPageData>,
) {
  const { farm, logs, success } = data;
  const today = new Date().toISOString().split("T")[0];

  const getActivityInfo = (type: string) =>
    ACTIVITY_TYPES.find((t) => t.id === type) ||
    ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];

  return (
    <AppShell
      title="Activity Log"
      showBack
      actions={
        <a href={`/app/farm/${farm.id}`} class="text-white text-sm">
          Farm Details
        </a>
      }
    >
      {success === "added" && (
        <div class="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">
          Activity logged successfully!
        </div>
      )}

      {/* Add Activity Form */}
      <div class="bg-white rounded-xl border p-4 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">Log New Activity</h3>
        <form method="POST" class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Activity Type *
            </label>
            <select
              name="activity_type"
              required
              class="w-full px-3 py-2 border rounded-lg"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <input
              type="text"
              name="description"
              required
              class="w-full px-3 py-2 border rounded-lg"
              placeholder="e.g., Applied 50kg Urea"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="activity_date"
                required
                defaultValue={today}
                max={today}
                class="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Cost (₹)
              </label>
              <input
                type="number"
                name="cost"
                step="0.01"
                class="w-full px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                name="quantity"
                step="0.01"
                class="w-full px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Unit
              </label>
              <select name="unit" class="w-full px-3 py-2 border rounded-lg">
                <option value="">Select...</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="liter">Liters (L)</option>
                <option value="bag">Bags</option>
                <option value="acre">Acres</option>
                <option value="hectare">Hectares</option>
                <option value="hour">Hours</option>
                <option value="unit">Units</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              rows={2}
              class="w-full px-3 py-2 border rounded-lg"
              placeholder="Additional details..."
            />
          </div>

          <button
            type="submit"
            class="w-full py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
          >
            Add Activity
          </button>
        </form>
      </div>

      {/* Activity Timeline */}
      <div class="bg-white rounded-xl border">
        <div class="px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">Activity History</h3>
          <p class="text-sm text-gray-500">{farm.name}</p>
        </div>

        {logs.length === 0
          ? (
            <div class="p-8 text-center text-gray-500">
              <p>No activities logged yet</p>
              <p class="text-sm mt-1">
                Start logging your farm activities above
              </p>
            </div>
          )
          : (
            <div class="divide-y">
              {logs.map((log) => {
                const info = getActivityInfo(log.activityType);
                return (
                  <div key={log.id} class="p-4 flex gap-3">
                    <div
                      class={`w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-${info.color}-100`}
                    >
                      {info.icon}
                    </div>
                    <div class="flex-1">
                      <div class="flex items-start justify-between">
                        <div>
                          <p class="font-medium text-gray-900">
                            {log.description}
                          </p>
                          <p class="text-sm text-gray-500">{info.label}</p>
                        </div>
                        <p class="text-sm text-gray-500">
                          {new Date(log.activityDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                            },
                          )}
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2 mt-2">
                        {log.quantity && log.unit && (
                          <span class="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                            {log.quantity} {log.unit}
                          </span>
                        )}
                        {log.cost && (
                          <span class="px-2 py-0.5 bg-green-100 rounded text-xs text-green-700">
                            ₹{log.cost.toFixed(0)}
                          </span>
                        )}
                      </div>
                      {log.notes && (
                        <p class="text-sm text-gray-500 mt-1">{log.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {/* Summary Stats */}
      {logs.length > 0 && (
        <div class="mt-4 bg-white rounded-xl border p-4">
          <h3 class="font-semibold text-gray-900 mb-3">Summary</h3>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-gray-900">{logs.length}</p>
              <p class="text-xs text-gray-500">Activities</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-green-600">
                ₹{logs.reduce((sum, l) => sum + (l.cost || 0), 0)
                  .toLocaleString("en-IN")}
              </p>
              <p class="text-xs text-gray-500">Total Cost</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-gray-900">
                {new Set(logs.map((l) => l.activityType)).size}
              </p>
              <p class="text-xs text-gray-500">Activity Types</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
