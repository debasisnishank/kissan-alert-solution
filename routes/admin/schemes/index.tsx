import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface SchemeData {
  id: string;
  name: string;
  description: string;
  type: string;
  eligibility: string;
  benefits: string;
  deadline: string | null;
  isActive: boolean;
  applicationsCount: number;
}

interface SchemesPageData {
  schemes: SchemeData[];
  stats: {
    total: number;
    active: number;
    expiringSoon: number;
  };
  filter: string;
}

export const handler: Handlers<SchemesPageData, AuthState> = {
  async GET(req, ctx) {
    if (
      !ctx.state.session ||
      ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin"
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";

    let whereClause = "";
    if (filter === "active") whereClause = "WHERE is_active = true";
    else if (filter === "expired") whereClause = "WHERE deadline < NOW()";

    const schemes = await query<{
      id: string;
      name: string;
      description: string;
      type: string;
      eligibility: string;
      benefits: string;
      deadline: Date | null;
      is_active: boolean;
    }>(
      `SELECT id, name, description, type, eligibility, benefits, deadline, is_active
       FROM government_schemes ${whereClause}
       ORDER BY deadline ASC NULLS LAST, created_at DESC`,
      [],
    );

    const stats = await query<
      { total: number; active: number; expiring: number }
    >(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE deadline BETWEEN NOW() AND NOW() + INTERVAL '30 days') as expiring
       FROM government_schemes`,
      [],
    );

    return ctx.render({
      schemes: schemes.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type || "general",
        eligibility: s.eligibility || "",
        benefits: s.benefits || "",
        deadline: s.deadline
          ? new Date(s.deadline).toLocaleDateString("en-IN")
          : null,
        isActive: s.is_active,
        applicationsCount: 0,
      })),
      stats: {
        total: Number(stats[0]?.total || 0),
        active: Number(stats[0]?.active || 0),
        expiringSoon: Number(stats[0]?.expiring || 0),
      },
      filter,
    });
  },
};

export default function AdminSchemesPage({ data }: PageProps<SchemesPageData>) {
  const { schemes, stats, filter } = data;

  const typeColors: Record<string, string> = {
    subsidy: "bg-green-100 text-green-700",
    insurance: "bg-blue-100 text-blue-700",
    loan: "bg-purple-100 text-purple-700",
    training: "bg-orange-100 text-orange-700",
    general: "bg-gray-100 text-gray-700",
  };

  return (
    <AdminLayout title="Schemes & Programs" currentPage="schemes">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">
            Manage government schemes and programs
          </p>
          <a
            href="/admin/schemes/create"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            + Add Scheme
          </a>
        </div>
        {/* Stats */}
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Total Schemes</p>
            <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Active</p>
            <p class="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Expiring Soon</p>
            <p class="text-2xl font-bold text-orange-600">
              {stats.expiringSoon}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div class="flex gap-2 mb-4">
          {["all", "active", "expired"].map((f) => (
            <a
              key={f}
              href={`/admin/schemes?filter=${f}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                filter === f
                  ? "bg-primary-600 text-white"
                  : "bg-white border text-gray-700"
              }`}
            >
              {f}
            </a>
          ))}
        </div>

        {/* Schemes List */}
        <div class="space-y-4">
          {schemes.length > 0
            ? (
              schemes.map((scheme) => (
                <div key={scheme.id} class="bg-white rounded-lg border p-4">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h3 class="font-semibold text-gray-900">
                          {scheme.name}
                        </h3>
                        <span
                          class={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            typeColors[scheme.type]
                          }`}
                        >
                          {scheme.type}
                        </span>
                        {!scheme.isActive && (
                          <span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p class="text-sm text-gray-600 mb-2">
                        {scheme.description}
                      </p>
                      {scheme.benefits && (
                        <p class="text-sm text-green-600">
                          Benefits: {scheme.benefits}
                        </p>
                      )}
                    </div>
                    <div class="text-right">
                      {scheme.deadline && (
                        <p class="text-sm text-orange-600 font-medium">
                          Due: {scheme.deadline}
                        </p>
                      )}
                      <a
                        href={`/admin/schemes/${scheme.id}/edit`}
                        class="text-sm text-primary-600 hover:underline"
                      >
                        Edit
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )
            : (
              <div class="bg-white rounded-lg border p-8 text-center">
                <p class="text-gray-500">No schemes found</p>
                <a
                  href="/admin/schemes/create"
                  class="text-primary-600 text-sm mt-2 inline-block"
                >
                  Create your first scheme
                </a>
              </div>
            )}
        </div>
      </div>
    </AdminLayout>
  );
}
