import { Handlers } from "$fresh/server.ts";
import {
  getFarmHealthStats,
  getObservationsByFarm,
} from "$lib/observations.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_READ);
    if (authError) return authError;

    const { id: farmId } = ctx.params;
    const url = new URL(req.url);

    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const source = url.searchParams.get("source") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "365");
    const includeStats = url.searchParams.get("includeStats") === "true";

    try {
      const observations = await getObservationsByFarm(farmId, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        source,
        limit,
      });

      const response: Record<string, unknown> = { data: observations };

      if (includeStats) {
        const stats = await getFarmHealthStats(farmId);
        response.stats = stats;
      }

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching observations:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch observations" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
