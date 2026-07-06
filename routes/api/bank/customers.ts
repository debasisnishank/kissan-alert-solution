import { Handlers } from "$fresh/server.ts";
import {
  createBankCustomer,
  listBankCustomers,
  searchUserByPhone,
} from "$lib/bank.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_READ);
    if (authError) return authError;

    const url = new URL(req.url);
    const search = url.searchParams.get("search") || undefined;
    const phone = url.searchParams.get("phone");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const tenantId = ctx.state.session!.tenantId;
    const bankOfficerId = ctx.state.session!.role === "bank_officer"
      ? ctx.state.session!.userId
      : undefined;

    // If phone is provided, search for specific user
    if (phone) {
      const user = await searchUserByPhone(phone, tenantId);
      return new Response(
        JSON.stringify({ data: user, found: !!user }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // List all customers
    const { customers, total } = await listBankCustomers(tenantId, {
      bankOfficerId,
      search,
      limit,
      offset,
    });

    return new Response(
      JSON.stringify({
        data: customers,
        meta: { total, limit, offset },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },

  async POST(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_CREATE);
    if (authError) return authError;

    try {
      const body = await req.json();
      const { userId, notes } = body;

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const tenantId = ctx.state.session!.tenantId;
      const bankOfficerId = ctx.state.session!.userId;

      const customer = await createBankCustomer({
        tenantId,
        userId,
        bankOfficerId,
        notes,
      });

      if (!customer) {
        return new Response(
          JSON.stringify({ error: "Failed to create customer" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ data: customer }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error creating bank customer:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create customer" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
