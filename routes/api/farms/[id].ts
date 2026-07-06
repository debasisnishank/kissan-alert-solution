import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  CreateFarmInput,
  deleteFarm,
  getFarmById,
  updateFarm,
} from "$lib/farm.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_READ);
    if (authError) return authError;

    const { id } = ctx.params;
    const tenantId = ctx.state.session!.tenantId;

    try {
      const farm = await getFarmById(id, tenantId);

      if (!farm) {
        return new Response(JSON.stringify({ error: "Farm not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: farm }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching farm:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch farm" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async PUT(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_UPDATE);
    if (authError) return authError;

    const { id } = ctx.params;
    const tenantId = ctx.state.session!.tenantId;

    try {
      const body = await req.json();
      const input = CreateFarmInput.partial().parse(body);

      const farm = await updateFarm(id, tenantId, input);

      if (!farm) {
        return new Response(JSON.stringify({ error: "Farm not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: farm }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: "Validation error", details: error.errors }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      console.error("Error updating farm:", error);
      return new Response(JSON.stringify({ error: "Failed to update farm" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async DELETE(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_DELETE);
    if (authError) return authError;

    const { id } = ctx.params;
    const tenantId = ctx.state.session!.tenantId;

    try {
      const deleted = await deleteFarm(id, tenantId);

      if (!deleted) {
        return new Response(JSON.stringify({ error: "Farm not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error deleting farm:", error);
      return new Response(JSON.stringify({ error: "Failed to delete farm" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
