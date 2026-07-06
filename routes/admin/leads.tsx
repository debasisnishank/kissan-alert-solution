import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import {
  type FarmerLead,
  farmerLeadsToCSV,
  type FarmLead,
  farmLeadsToCSV,
  getFarmerLeads,
  getFarmLeads,
} from "$lib/leads.ts";

interface SharedLink {
  id: string;
  label: string;
  token: string;
  segment: string;
  exportType: string;
  format: string;
  expiresAt: string;
  accessCount: number;
  maxAccessCount: number;
  isActive: boolean;
}

interface LeadsPageData {
  tab: "farmers" | "farms" | "links";
  segment: string;
  farmerLeads: FarmerLead[];
  farmLeads: FarmLead[];
  sharedLinks: SharedLink[];
  farmerSegments: Record<string, number>;
  farmSegments: Record<string, number>;
  success?: string;
}

export const handler: Handlers<LeadsPageData, AuthState> = {
  async GET(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const url = new URL(req.url);
    const tab =
      (url.searchParams.get("tab") as "farmers" | "farms" | "links") ||
      "farmers";
    const segment = url.searchParams.get("segment") || "all";

    // CSV/JSON direct download
    const exportFormat = url.searchParams.get("export");
    if (exportFormat === "csv" || exportFormat === "json") {
      if (tab === "farmers") {
        const leads = await getFarmerLeads(tenantId, segment);
        if (exportFormat === "csv") {
          return new Response(farmerLeadsToCSV(leads), {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition":
                `attachment; filename="farmer-leads-${segment}-${
                  new Date().toISOString().split("T")[0]
                }.csv"`,
            },
          });
        }
        return new Response(JSON.stringify({ leads }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              `attachment; filename="farmer-leads-${segment}-${
                new Date().toISOString().split("T")[0]
              }.json"`,
          },
        });
      } else {
        const leads = await getFarmLeads(tenantId, segment);
        if (exportFormat === "csv") {
          return new Response(farmLeadsToCSV(leads), {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition":
                `attachment; filename="farm-leads-${segment}-${
                  new Date().toISOString().split("T")[0]
                }.csv"`,
            },
          });
        }
        return new Response(JSON.stringify({ leads }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              `attachment; filename="farm-leads-${segment}-${
                new Date().toISOString().split("T")[0]
              }.json"`,
          },
        });
      }
    }

    const [farmerLeads, farmLeads, links] = await Promise.all([
      tab === "farmers"
        ? getFarmerLeads(tenantId, segment)
        : getFarmerLeads(tenantId),
      tab === "farms"
        ? getFarmLeads(tenantId, segment)
        : getFarmLeads(tenantId),
      query<{
        id: string;
        label: string;
        token: string;
        segment: string;
        export_type: string;
        format: string;
        expires_at: Date;
        access_count: number;
        max_access_count: number;
        is_active: boolean;
      }>(
        `SELECT id, label, token, segment, export_type, format, expires_at,
                access_count, max_access_count, is_active
         FROM lead_export_links
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId],
      ),
    ]);

    // Compute segment counts
    const farmerSegments: Record<string, number> = {};
    const allFarmers = tab === "farmers" && segment !== "all"
      ? await getFarmerLeads(tenantId)
      : farmerLeads;
    for (const l of allFarmers) {
      farmerSegments[l.segment] = (farmerSegments[l.segment] || 0) + 1;
    }

    const farmSegments: Record<string, number> = {};
    const allFarms = tab === "farms" && segment !== "all"
      ? await getFarmLeads(tenantId)
      : farmLeads;
    for (const l of allFarms) {
      farmSegments[l.segment] = (farmSegments[l.segment] || 0) + 1;
    }

    return ctx.render({
      tab,
      segment,
      farmerLeads: tab === "farmers" ? farmerLeads : [],
      farmLeads: tab === "farms" ? farmLeads : [],
      sharedLinks: links.map((l) => ({
        id: l.id,
        label: l.label,
        token: l.token,
        segment: l.segment,
        exportType: l.export_type,
        format: l.format,
        expiresAt: new Date(l.expires_at).toLocaleDateString("en-IN"),
        accessCount: l.access_count,
        maxAccessCount: l.max_access_count,
        isActive: l.is_active,
      })),
      farmerSegments,
      farmSegments,
      success: url.searchParams.get("success") || undefined,
    });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, { status: 403 });
    }

    const tenantId = ctx.state.session.tenantId;
    const userId = ctx.state.session.userId;
    const form = await req.formData();
    const action = form.get("action") as string;

    if (action === "create_link") {
      const label = form.get("label") as string || "Lead Export";
      const segment = form.get("segment") as string || "all";
      const exportType = form.get("export_type") as string || "farmer";
      const format = form.get("format") as string || "json";
      const expiryDays = parseInt(form.get("expiry_days") as string || "7");
      const maxAccess = parseInt(form.get("max_access") as string || "100");

      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await execute(
        `INSERT INTO lead_export_links (tenant_id, created_by, token, label, segment, export_type, format, expires_at, max_access_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '${expiryDays} days', $8)`,
        [
          tenantId,
          userId,
          token,
          label,
          segment,
          exportType,
          format,
          maxAccess,
        ],
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/admin/leads?tab=links&success=link_created`,
        },
      });
    }

    if (action === "toggle_link") {
      const linkId = form.get("link_id") as string;
      await execute(
        `UPDATE lead_export_links SET is_active = NOT is_active WHERE id = $1 AND tenant_id = $2`,
        [linkId, tenantId],
      );
      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/leads?tab=links&success=toggled` },
      });
    }

    if (action === "delete_link") {
      const linkId = form.get("link_id") as string;
      await execute(
        `DELETE FROM lead_export_links WHERE id = $1 AND tenant_id = $2`,
        [linkId, tenantId],
      );
      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/leads?tab=links&success=deleted` },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/leads" },
    });
  },
};

const SEGMENT_LABELS: Record<string, [string, string]> = {
  all: ["All", "bg-gray-100 text-gray-700"],
  high_value: ["High Value", "bg-emerald-100 text-emerald-700"],
  engaged: ["Engaged", "bg-blue-100 text-blue-700"],
  new_lead: ["New Lead", "bg-purple-100 text-purple-700"],
  at_risk: ["At Risk", "bg-red-100 text-red-700"],
  dormant: ["Dormant", "bg-yellow-100 text-yellow-700"],
  inactive: ["Inactive", "bg-gray-200 text-gray-500"],
  healthy: ["Healthy", "bg-green-100 text-green-700"],
  needs_attention: ["Needs Attention", "bg-orange-100 text-orange-700"],
  no_data: ["No Data", "bg-gray-100 text-gray-500"],
  moderate: ["Moderate", "bg-cyan-100 text-cyan-700"],
};

function SegmentBadge({ segment }: { segment: string }) {
  const [label, cls] = SEGMENT_LABELS[segment] ||
    ["Unknown", "bg-gray-100 text-gray-600"];
  return (
    <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function EngagementBar({ score }: { score: number }) {
  const color = score >= 70
    ? "bg-emerald-500"
    : score >= 40
    ? "bg-blue-500"
    : score >= 20
    ? "bg-yellow-500"
    : "bg-gray-300";
  return (
    <div class="flex items-center gap-2">
      <div class="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class={`h-full ${color} rounded-full`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span class="text-xs text-gray-500">{score}</span>
    </div>
  );
}

export default function LeadsPage({ data }: PageProps<LeadsPageData>) {
  const {
    tab,
    segment,
    farmerLeads,
    farmLeads,
    sharedLinks,
    farmerSegments,
    farmSegments,
    success,
  } = data;

  const tabs = [
    ["farmers", "Farmer Leads"],
    ["farms", "Farm Leads"],
    ["links", "Shared Links"],
  ];

  const farmerSegmentKeys = [
    "all",
    "high_value",
    "engaged",
    "new_lead",
    "at_risk",
    "dormant",
    "inactive",
  ];
  const farmSegmentKeys = [
    "all",
    "high_value",
    "healthy",
    "moderate",
    "at_risk",
    "needs_attention",
    "no_data",
  ];

  const totalFarmers = Object.values(farmerSegments).reduce(
    (a, b) => a + b,
    0,
  );
  const totalFarms = Object.values(farmSegments).reduce((a, b) => a + b, 0);

  return (
    <AdminLayout title="CRM Leads" currentPage="leads">
      {success && (
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success === "link_created" && "Shareable link created successfully."}
          {success === "toggled" && "Link status toggled."}
          {success === "deleted" && "Link deleted."}
        </div>
      )}

      {/* Overview Stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white rounded-xl p-4 border">
          <div class="text-2xl font-bold text-gray-900">{totalFarmers}</div>
          <div class="text-xs text-gray-500 mt-1">Total Farmer Leads</div>
        </div>
        <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <div class="text-2xl font-bold text-emerald-700">
            {farmerSegments["high_value"] || 0}
          </div>
          <div class="text-xs text-emerald-600 mt-1">High Value Farmers</div>
        </div>
        <div class="bg-white rounded-xl p-4 border">
          <div class="text-2xl font-bold text-gray-900">{totalFarms}</div>
          <div class="text-xs text-gray-500 mt-1">Total Farm Leads</div>
        </div>
        <div class="bg-red-50 rounded-xl p-4 border border-red-200">
          <div class="text-2xl font-bold text-red-700">
            {(farmerSegments["at_risk"] || 0) + (farmSegments["at_risk"] || 0)}
          </div>
          <div class="text-xs text-red-600 mt-1">At Risk (Need Attention)</div>
        </div>
      </div>

      {/* Tabs */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex gap-1">
          {tabs.map(([key, label]) => (
            <a
              key={key}
              href={`/admin/leads?tab=${key}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border hover:bg-gray-50"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
        {tab !== "links" && (
          <div class="flex gap-2">
            <a
              href={`/admin/leads?tab=${tab}&segment=${segment}&export=csv`}
              class="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800"
            >
              Export CSV
            </a>
            <a
              href={`/admin/leads?tab=${tab}&segment=${segment}&export=json`}
              class="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700"
            >
              Export JSON
            </a>
          </div>
        )}
      </div>

      {/* Farmer Leads Tab */}
      {tab === "farmers" && (
        <>
          {/* Segment Filter */}
          <div class="flex flex-wrap gap-1 mb-4">
            {farmerSegmentKeys.map((key) => {
              const [label] = SEGMENT_LABELS[key] || [key];
              const count = key === "all"
                ? totalFarmers
                : (farmerSegments[key] || 0);
              return (
                <a
                  key={key}
                  href={`/admin/leads?tab=farmers&segment=${key}`}
                  class={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    segment === key
                      ? "bg-primary-600 text-white"
                      : "bg-white text-gray-600 border hover:bg-gray-50"
                  }`}
                >
                  {label} ({count})
                </a>
              );
            })}
          </div>

          <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Farmer
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Contact
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Farms
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Area (ha)
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Crop
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Health
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Engagement
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Segment
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  {farmerLeads.map((lead) => (
                    <tr key={lead.id} class="hover:bg-gray-50">
                      <td class="px-4 py-3">
                        <div>
                          <a
                            href={`/admin/users/${lead.id}`}
                            class="font-medium text-gray-900 hover:text-primary-600"
                          >
                            {lead.name}
                          </a>
                          <div class="text-xs text-gray-400">
                            {lead.district} | {lead.language.toUpperCase()}
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm">
                        <div class="text-gray-900">{lead.phone}</div>
                        {lead.email && (
                          <div class="text-xs text-gray-400">{lead.email}</div>
                        )}
                      </td>
                      <td class="px-4 py-3 text-center text-sm text-gray-600">
                        {lead.farmCount}
                      </td>
                      <td class="px-4 py-3 text-center text-sm text-gray-600">
                        {lead.totalArea.toFixed(1)}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600 capitalize">
                        {lead.primaryCrop}
                      </td>
                      <td class="px-4 py-3 text-center">
                        <span
                          class={`text-sm font-medium ${
                            lead.avgHealthScore >= 70
                              ? "text-green-600"
                              : lead.avgHealthScore >= 40
                              ? "text-yellow-600"
                              : lead.avgHealthScore > 0
                              ? "text-red-600"
                              : "text-gray-400"
                          }`}
                        >
                          {lead.avgHealthScore > 0
                            ? lead.avgHealthScore.toFixed(0)
                            : "-"}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <EngagementBar score={lead.engagementScore} />
                      </td>
                      <td class="px-4 py-3 text-center">
                        <SegmentBadge segment={lead.segment} />
                      </td>
                    </tr>
                  ))}
                  {farmerLeads.length === 0 && (
                    <tr>
                      <td
                        colspan={8}
                        class="px-4 py-12 text-center text-gray-400"
                      >
                        No farmer leads in this segment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Farm Leads Tab */}
      {tab === "farms" && (
        <>
          <div class="flex flex-wrap gap-1 mb-4">
            {farmSegmentKeys.map((key) => {
              const [label] = SEGMENT_LABELS[key] || [key];
              const count = key === "all"
                ? totalFarms
                : (farmSegments[key] || 0);
              return (
                <a
                  key={key}
                  href={`/admin/leads?tab=farms&segment=${key}`}
                  class={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    segment === key
                      ? "bg-primary-600 text-white"
                      : "bg-white text-gray-600 border hover:bg-gray-50"
                  }`}
                >
                  {label} ({count})
                </a>
              );
            })}
          </div>

          <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Farm
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Farmer
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Area (ha)
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Crop
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Health
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Engagement
                    </th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Segment
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  {farmLeads.map((lead) => (
                    <tr key={lead.id} class="hover:bg-gray-50">
                      <td class="px-4 py-3">
                        <div>
                          <a
                            href={`/admin/farms/${lead.id}`}
                            class="font-medium text-gray-900 hover:text-primary-600"
                          >
                            {lead.farmName}
                          </a>
                          <div class="flex items-center gap-1 mt-0.5">
                            {lead.isVerified && (
                              <span class="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
                                Verified
                              </span>
                            )}
                            <span class="text-xs text-gray-400">
                              {lead.soilType} | {lead.waterSource}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm">
                        <div class="text-gray-900">{lead.farmerName}</div>
                        <div class="text-xs text-gray-400">
                          {lead.farmerPhone}
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600">
                        <div>{lead.district}</div>
                        <div class="text-xs text-gray-400">
                          {lead.village}
                          {lead.state ? `, ${lead.state}` : ""}
                        </div>
                      </td>
                      <td class="px-4 py-3 text-center text-sm text-gray-600">
                        {lead.areaHectares.toFixed(1)}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600">
                        <div class="capitalize">{lead.currentCrop}</div>
                        {lead.cropSeason && (
                          <div class="text-xs text-gray-400 capitalize">
                            {lead.cropSeason}
                          </div>
                        )}
                      </td>
                      <td class="px-4 py-3 text-center">
                        <span
                          class={`text-sm font-medium ${
                            lead.healthScore >= 70
                              ? "text-green-600"
                              : lead.healthScore >= 40
                              ? "text-yellow-600"
                              : lead.healthScore > 0
                              ? "text-red-600"
                              : "text-gray-400"
                          }`}
                        >
                          {lead.healthScore > 0
                            ? lead.healthScore.toFixed(0)
                            : "-"}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <EngagementBar score={lead.engagementScore} />
                      </td>
                      <td class="px-4 py-3 text-center">
                        <SegmentBadge segment={lead.segment} />
                      </td>
                    </tr>
                  ))}
                  {farmLeads.length === 0 && (
                    <tr>
                      <td
                        colspan={8}
                        class="px-4 py-12 text-center text-gray-400"
                      >
                        No farm leads in this segment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Shared Links Tab */}
      {tab === "links" && (
        <>
          {/* Create Link Form */}
          <div class="bg-white rounded-xl shadow-sm border p-5 mb-6">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">
              Create Shareable Link
            </h3>
            <form method="POST">
              <input type="hidden" name="action" value="create_link" />
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    name="label"
                    required
                    placeholder="e.g. Agri-Input Partner Export"
                    class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Lead Type
                  </label>
                  <select
                    name="export_type"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="farmer">Farmer Leads</option>
                    <option value="farm">Farm Leads</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Segment
                  </label>
                  <select
                    name="segment"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="all">All</option>
                    <option value="high_value">High Value</option>
                    <option value="engaged">Engaged</option>
                    <option value="new_lead">New Lead</option>
                    <option value="at_risk">At Risk</option>
                    <option value="dormant">Dormant</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Format
                  </label>
                  <select
                    name="format"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Expires In (days)
                  </label>
                  <select
                    name="expiry_days"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="1">1 day</option>
                    <option value="7" selected>7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Max Access Count
                  </label>
                  <select
                    name="max_access"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="10">10 times</option>
                    <option value="50">50 times</option>
                    <option value="100" selected>100 times</option>
                    <option value="500">500 times</option>
                    <option value="9999">Unlimited</option>
                  </select>
                </div>
              </div>
              <div class="mt-3">
                <button
                  type="submit"
                  class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                >
                  Generate Link
                </button>
              </div>
            </form>
          </div>

          {/* Existing Links */}
          <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Label
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Link URL
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Type / Segment
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Access
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Expires
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {sharedLinks.map((link) => (
                  <tr key={link.id} class="hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium text-gray-900">
                      {link.label}
                    </td>
                    <td class="px-4 py-3">
                      <code class="text-xs bg-gray-100 px-2 py-1 rounded select-all break-all">
                        /api/leads/{link.token}
                      </code>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="text-xs capitalize">
                        {link.exportType} / {link.segment}
                      </span>
                      <span class="ml-1 text-xs text-gray-400">
                        ({link.format.toUpperCase()})
                      </span>
                    </td>
                    <td class="px-4 py-3 text-center text-sm">
                      <span
                        class={link.accessCount >= link.maxAccessCount
                          ? "text-red-600 font-medium"
                          : "text-gray-600"}
                      >
                        {link.accessCount}
                      </span>
                      <span class="text-gray-400">/{link.maxAccessCount}</span>
                    </td>
                    <td class="px-4 py-3 text-center text-xs text-gray-500">
                      {link.expiresAt}
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span
                        class={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          link.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {link.isActive ? "Active" : "Off"}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <div class="flex items-center justify-center gap-1">
                        <form method="POST" class="inline">
                          <input
                            type="hidden"
                            name="action"
                            value="toggle_link"
                          />
                          <input
                            type="hidden"
                            name="link_id"
                            value={link.id}
                          />
                          <button
                            type="submit"
                            class="px-2 py-1 text-xs text-gray-600 hover:text-primary-600"
                          >
                            {link.isActive ? "Disable" : "Enable"}
                          </button>
                        </form>
                        <form method="POST" class="inline">
                          <input
                            type="hidden"
                            name="action"
                            value="delete_link"
                          />
                          <input
                            type="hidden"
                            name="link_id"
                            value={link.id}
                          />
                          <button
                            type="submit"
                            class="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {sharedLinks.length === 0 && (
                  <tr>
                    <td
                      colspan={7}
                      class="px-4 py-12 text-center text-gray-400"
                    >
                      No shared links created yet. Use the form above to
                      generate one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
