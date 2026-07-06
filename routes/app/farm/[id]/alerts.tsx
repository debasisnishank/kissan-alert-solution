import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { AlertCard } from "$components/AlertCard.tsx";
import { getFarmById } from "$lib/farm.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

interface AlertData {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  createdAt: string;
  status: string;
}

interface FarmAlertsData {
  farm: { id: string; name: string };
  alerts: AlertData[];
}

export const handler: Handlers<FarmAlertsData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params;
    const { session, user } = ctx.state;

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    const alerts = await getAlertsWithAdvisory(
      farm.id,
      session.tenantId,
      user.language,
      { limit: 50 },
    );

    return ctx.render({
      farm: { id: farm.id, name: farm.name },
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.localizedTitle || a.title,
        description: a.localizedMessage || a.description,
        createdAt: new Date(a.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: a.status,
      })),
    });
  },
};

export default function FarmAlertsPage({ data }: PageProps<FarmAlertsData>) {
  const { farm, alerts } = data;

  const activeAlerts = alerts.filter((a) => a.status === "active");
  const resolvedAlerts = alerts.filter((a) => a.status !== "active");

  return (
    <AppShell title={`Alerts - ${farm.name}`} showBack>
      {/* Active Alerts */}
      <div class="mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          Active Alerts ({activeAlerts.length})
        </h2>

        {activeAlerts.length > 0
          ? (
            <div class="space-y-3">
              {activeAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  type={alert.type}
                  severity={alert.severity as
                    | "low"
                    | "medium"
                    | "high"
                    | "critical"}
                  title={alert.title}
                  description={alert.description}
                  timestamp={alert.createdAt}
                />
              ))}
            </div>
          )
          : (
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <svg
                class="w-8 h-8 text-green-500 mx-auto mb-2"
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
              <p class="text-green-700 font-medium">No active alerts</p>
              <p class="text-green-600 text-sm">
                Your farm is looking healthy!
              </p>
            </div>
          )}
      </div>

      {/* Resolved Alerts */}
      {resolvedAlerts.length > 0 && (
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-3">
            Past Alerts ({resolvedAlerts.length})
          </h2>
          <div class="space-y-3 opacity-60">
            {resolvedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                type={alert.type}
                severity={alert.severity as
                  | "low"
                  | "medium"
                  | "high"
                  | "critical"}
                title={alert.title}
                description={alert.description}
                timestamp={alert.createdAt}
              />
            ))}
          </div>
        </div>
      )}

      {/* Back to farm */}
      <div class="mt-6">
        <a
          href={`/app/farm/${farm.id}`}
          class="block text-center text-primary-600 font-medium py-2"
        >
          ← Back to {farm.name}
        </a>
      </div>
    </AppShell>
  );
}
