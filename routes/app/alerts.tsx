import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { AlertCard } from "$components/AlertCard.tsx";
import { getFarmsByFarmer } from "$lib/farm.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface AlertsPageData {
  alerts: Array<{
    id: string;
    farmName: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    message: string;
    timestamp: string;
    audioUrl?: string;
    actions?: { label: string; type: string; value: string }[];
  }>;
  filter: string;
}

export const handler: Handlers<AlertsPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session, user } = ctx.state;
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";

    const farms = await getFarmsByFarmer(session.userId, session.tenantId);
    const farmMap = new Map(farms.map((f) => [f.id, f.name]));

    const allAlerts = [];
    for (const farm of farms) {
      const status = filter === "resolved" ? "resolved" : "active";
      const alerts = await getAlertsWithAdvisory(
        farm.id,
        session.tenantId,
        user.language,
        {
          status: status as "active" | "resolved",
          limit: 50,
        },
      );
      allAlerts.push(
        ...alerts.map((a) => ({
          ...a,
          farmName: farmMap.get(a.farmId) || "Unknown",
        })),
      );
    }

    // Filter by type if specified
    const filteredAlerts = filter === "all" || filter === "resolved"
      ? allAlerts
      : allAlerts.filter((a) => a.type === filter);

    // Sort by severity and date
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    filteredAlerts.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] -
        severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return ctx.render({
      alerts: filteredAlerts.map((alert) => ({
        id: alert.id,
        farmName: alert.farmName,
        type: alert.type,
        severity: alert.severity,
        title: alert.advisory?.title || alert.title,
        message: alert.advisory?.message || alert.description,
        timestamp: alert.createdAt.toISOString(),
        audioUrl: alert.advisory?.audioUrl,
        actions: alert.advisory?.actions,
      })),
      filter,
    });
  },
};

export default function AlertsPage({ data }: PageProps<AlertsPageData>) {
  const { alerts, filter } = data;

  const filters = [
    { id: "all", label: "All" },
    { id: "weather", label: "Weather" },
    { id: "pest", label: "Pest" },
    { id: "irrigation", label: "Irrigation" },
    { id: "nutrient", label: "Nutrient" },
    { id: "harvest", label: "Harvest" },
  ];

  return (
    <AppShell title="Alerts" showBack>
      {/* Filter Tabs */}
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4 scrollbar-hide">
        {filters.map((f) => (
          <a
            key={f.id}
            href={`/app/alerts?filter=${f.id}`}
            class={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.id
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Alerts List */}
      {alerts.length > 0
        ? (
          <div class="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id}>
                <p class="text-xs text-gray-500 mb-1 ml-1">{alert.farmName}</p>
                <AlertCard {...alert} />
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 class="text-lg font-semibold text-gray-900 mb-1">No Alerts</h3>
            <p class="text-sm text-gray-500">
              {filter === "all"
                ? "You're all caught up!"
                : `No ${filter} alerts at this time`}
            </p>
          </div>
        )}
    </AppShell>
  );
}
