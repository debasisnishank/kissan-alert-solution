import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  createCropDeclaration,
  CreateCropInput,
  getActiveCropByFarm,
  getCropHistory,
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
    const farmId = url.searchParams.get("farmId");
    const activeOnly = url.searchParams.get("activeOnly") === "true";

    if (!farmId) {
      return new Response(JSON.stringify({ error: "farmId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      if (activeOnly) {
        const crop = await getActiveCropByFarm(farmId);
        return new Response(JSON.stringify({ data: crop }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const crops = await getCropHistory(farmId);
      return new Response(JSON.stringify({ data: crops }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching crops:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch crops" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async POST(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.FARM_UPDATE);
    if (authError) return authError;

    try {
      const body = await req.json();
      const input = CreateCropInput.parse(body);

      const crop = await createCropDeclaration(input);

      return new Response(JSON.stringify({ data: crop }), {
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

      console.error("Error creating crop:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create crop declaration" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
