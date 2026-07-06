import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  createFarm,
  CreateFarmInput,
  getFarmsByFarmer,
  listFarms,
} from "$lib/farm.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_READ);
    if (authError) return authError;

    const url = new URL(req.url);
    const farmerId = url.searchParams.get("farmerId");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const district = url.searchParams.get("district") || undefined;

    try {
      const tenantId = ctx.state.session!.tenantId;

      if (farmerId) {
        // Get farms for specific farmer
        const farms = await getFarmsByFarmer(farmerId, tenantId);
        return new Response(JSON.stringify({ data: farms }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // List all farms (admin/extension officer)
      const { farms, total } = await listFarms(tenantId, {
        limit,
        offset,
        district,
      });
      return new Response(
        JSON.stringify({
          data: farms,
          meta: { total, limit, offset },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error fetching farms:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch farms" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async POST(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_CREATE);
    if (authError) return authError;

    try {
      const body = await req.json();
      const input = CreateFarmInput.parse(body);

      // Bank officers and admins can create farms for other users
      let farmerId = ctx.state.session!.userId;
      const allowedRoles = ["bank_officer", "admin", "tenant_admin"];
      if (body.farmerId && allowedRoles.includes(ctx.state.session!.role)) {
        farmerId = body.farmerId;
      }

      const farm = await createFarm(
        ctx.state.session!.tenantId,
        farmerId,
        input,
      );

      return new Response(JSON.stringify({ data: farm }), {
        status: 201,
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

      console.error("Error creating farm:", error);
      return new Response(JSON.stringify({ error: "Failed to create farm" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
