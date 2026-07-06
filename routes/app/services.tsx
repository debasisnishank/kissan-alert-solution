import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ServiceProvider {
  id: string;
  businessName: string;
  serviceTypes: string[];
  rating: number | null;
  totalBookings: number;
}

interface ServicesPageData {
  providers: ServiceProvider[];
  serviceType: string;
}

export const handler: Handlers<ServicesPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const serviceType = url.searchParams.get("type") || "all";
    const tenantId = ctx.state.session.tenantId;

    let whereClause =
      "tenant_id = $1 AND is_active = true AND kyc_status = 'verified'";
    const params: unknown[] = [tenantId];

    if (serviceType !== "all") {
      params.push([serviceType]);
      whereClause += ` AND service_types && $${params.length}`;
    }

    const providers = await query<{
      id: string;
      business_name: string;
      service_types: string[];
      rating: number | null;
      total_bookings: number;
    }>(
      `SELECT id, business_name, service_types, rating, total_bookings
       FROM service_providers
       WHERE ${whereClause}
       ORDER BY rating DESC NULLS LAST, total_bookings DESC
       LIMIT 50`,
      params,
    );

    return ctx.render({
      providers: providers.map((p) => ({
        id: p.id,
        businessName: p.business_name,
        serviceTypes: p.service_types,
        rating: p.rating,
        totalBookings: p.total_bookings,
      })),
      serviceType,
    });
  },
};

export default function ServicesPage({ data }: PageProps<ServicesPageData>) {
  const { providers, serviceType } = data;

  const serviceTypes = [
    { id: "all", label: "All Services" },
    { id: "tractor", label: "Tractor" },
    { id: "harvester", label: "Harvester" },
    { id: "spraying", label: "Spraying" },
    { id: "transport", label: "Transport" },
    { id: "drone", label: "Drone Services" },
  ];

  const serviceIcons: Record<string, string> = {
    tractor: "🚜",
    harvester: "🌾",
    spraying: "💨",
    transport: "🚛",
    drone: "🛸",
  };

  return (
    <AppShell title="Agri Services" showBack>
      {/* Filter Tabs */}
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
        {serviceTypes.map((t) => (
          <a
            key={t.id}
            href={`/app/services?type=${t.id}`}
            class={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              serviceType === t.id
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Providers List */}
      {providers.length > 0
        ? (
          <div class="space-y-3">
            {providers.map((provider) => (
              <a
                key={provider.id}
                href={`/app/services/${provider.id}`}
                class="block bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
              >
                <div class="flex items-start gap-3">
                  <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-2xl">
                    {serviceIcons[provider.serviceTypes[0]] || "🔧"}
                  </div>
                  <div class="flex-1">
                    <h3 class="font-semibold text-gray-900">
                      {provider.businessName}
                    </h3>
                    <div class="flex flex-wrap gap-1 mt-1">
                      {provider.serviceTypes.map((type) => (
                        <span
                          key={type}
                          class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                    <div class="flex items-center gap-3 mt-2 text-sm">
                      {provider.rating && (
                        <span class="flex items-center gap-1 text-yellow-600">
                          <svg
                            class="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {provider.rating.toFixed(1)}
                        </span>
                      )}
                      <span class="text-gray-500">
                        {provider.totalBookings} bookings
                      </span>
                    </div>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </a>
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 class="text-lg font-semibold text-gray-900 mb-1">
              No Service Providers
            </h3>
            <p class="text-sm text-gray-500">
              No verified providers in your area yet.
            </p>
          </div>
        )}
    </AppShell>
  );
}
