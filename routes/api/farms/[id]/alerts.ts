import { Handlers } from "$fresh/server.ts";
import { getAlertsWithAdvisory, updateAlertStatus } from "$lib/alerts.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";
import type { Alert } from "$utils/types.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.ALERT_READ);
    if (authError) return authError;

    const { id: farmId } = ctx.params;
    const tenantId = ctx.state.session!.tenantId;
    const userLanguage = ctx.state.user?.language || "en";

    const url = new URL(req.url);
    const status = url.searchParams.get("status") as Alert["status"] | null;
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const language = url.searchParams.get("language") || userLanguage;

    try {
      const alerts = await getAlertsWithAdvisory(
        farmId,
        tenantId,
        language,
        { status: status || undefined, limit },
      );

      return new Response(JSON.stringify({ data: alerts }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching alerts:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch alerts" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async PATCH(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.ALERT_READ);
    if (authError) return authError;

    const tenantId = ctx.state.session!.tenantId;

    try {
      const body = await req.json();
      const { alertId, status } = body;

      if (!alertId || !status) {
        return new Response(
          JSON.stringify({ error: "alertId and status required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const validStatuses: Alert["status"][] = [
        "active",
        "acknowledged",
        "resolved",
        "dismissed",
      ];
      if (!validStatuses.includes(status)) {
        return new Response(JSON.stringify({ error: "Invalid status" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const alert = await updateAlertStatus(alertId, tenantId, status);

      if (!alert) {
        return new Response(JSON.stringify({ error: "Alert not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: alert }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error updating alert:", error);
      return new Response(JSON.stringify({ error: "Failed to update alert" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
