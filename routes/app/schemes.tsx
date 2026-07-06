import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface SchemeData {
  id: string;
  name: string;
  nameLocal: Record<string, string>;
  description: string;
  type: string;
  documentsRequired: string[];
  applicationUrl: string | null;
  isActive: boolean;
}

interface SchemesPageData {
  schemes: SchemeData[];
  filter: string;
}

export const handler: Handlers<SchemesPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const filter = url.searchParams.get("type") || "all";

    let whereClause = "is_active = true";
    const params: unknown[] = [];

    if (filter !== "all") {
      params.push(filter);
      whereClause += ` AND type = $${params.length}`;
    }

    const schemes = await query<{
      id: string;
      name: string;
      name_local: Record<string, string>;
      description: string;
      type: string;
      documents_required: string[];
      application_url: string | null;
      is_active: boolean;
    }>(
      `SELECT id, name, name_local, description, type, documents_required, application_url, is_active
       FROM schemes WHERE ${whereClause} ORDER BY name`,
      params,
    );

    return ctx.render({
      schemes: schemes.map((s) => ({
        id: s.id,
        name: s.name,
        nameLocal: s.name_local,
        description: s.description,
        type: s.type,
        documentsRequired: s.documents_required,
        applicationUrl: s.application_url,
        isActive: s.is_active,
      })),
      filter,
    });
  },
};

export default function SchemesPage({ data }: PageProps<SchemesPageData>) {
  const { schemes, filter } = data;

  const typeFilters = [
    { id: "all", label: "All" },
    { id: "subsidy", label: "Subsidies" },
    { id: "loan", label: "Loans" },
    { id: "insurance", label: "Insurance" },
    { id: "training", label: "Training" },
  ];

  const typeColors: Record<string, string> = {
    subsidy: "bg-green-100 text-green-700",
    loan: "bg-blue-100 text-blue-700",
    insurance: "bg-purple-100 text-purple-700",
    training: "bg-orange-100 text-orange-700",
    other: "bg-gray-100 text-gray-700",
  };

  return (
    <AppShell title="Govt. Schemes" showBack>
      {/* Filter Tabs */}
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
        {typeFilters.map((t) => (
          <a
            key={t.id}
            href={`/app/schemes?type=${t.id}`}
            class={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              filter === t.id
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Schemes List */}
      {schemes.length > 0
        ? (
          <div class="space-y-4">
            {schemes.map((scheme) => (
              <div
                key={scheme.id}
                class="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div class="flex items-start justify-between mb-2">
                  <h3 class="font-semibold text-gray-900">{scheme.name}</h3>
                  <span
                    class={`px-2 py-1 rounded-full text-xs font-medium ${
                      typeColors[scheme.type] || typeColors.other
                    }`}
                  >
                    {scheme.type}
                  </span>
                </div>
                <p class="text-sm text-gray-600 mb-3">{scheme.description}</p>

                {scheme.documentsRequired.length > 0 && (
                  <div class="mb-3">
                    <p class="text-xs font-medium text-gray-500 mb-1">
                      Documents Required:
                    </p>
                    <div class="flex flex-wrap gap-1">
                      {scheme.documentsRequired.map((doc, i) => (
                        <span
                          key={i}
                          class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                        >
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {scheme.applicationUrl && (
                  <a
                    href={scheme.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-sm text-primary-600 font-medium hover:text-primary-700"
                  >
                    Apply Online
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                )}
              </div>
            ))}
          </div>
        )
        : (
          <div class="text-center py-12">
            <svg
              class="w-16 h-16 text-gray-300 mx-auto mb-4"
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
            <h3 class="text-lg font-semibold text-gray-900 mb-1">
              No Schemes Found
            </h3>
            <p class="text-sm text-gray-500">
              Check back later for new schemes
            </p>
          </div>
        )}
    </AppShell>
  );
}
