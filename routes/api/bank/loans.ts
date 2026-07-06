import { Handlers } from "$fresh/server.ts";
import { createLoanApplication, getBankStats, listLoans } from "$lib/bank.ts";
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
    const customerId = url.searchParams.get("customerId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const stats = url.searchParams.get("stats") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const tenantId = ctx.state.session!.tenantId;
    const bankOfficerId = ctx.state.session!.role === "bank_officer"
      ? ctx.state.session!.userId
      : undefined;

    // Return stats if requested
    if (stats) {
      const bankStats = await getBankStats(tenantId, bankOfficerId);
      return new Response(
        JSON.stringify({ data: bankStats }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // List loans
    const { loans, total } = await listLoans(tenantId, {
      customerId,
      status,
      bankOfficerId,
      limit,
      offset,
    });

    return new Response(
      JSON.stringify({
        data: loans,
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
      const {
        customerId,
        farmId,
        loanType,
        loanPurpose,
        requestedAmount,
        tenureMonths,
      } = body;

      if (!customerId || !requestedAmount) {
        return new Response(
          JSON.stringify({
            error: "customerId and requestedAmount are required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const tenantId = ctx.state.session!.tenantId;

      const loan = await createLoanApplication({
        tenantId,
        customerId,
        farmId,
        loanType: loanType || "crop_loan",
        loanPurpose,
        requestedAmount,
        tenureMonths: tenureMonths || 12,
      });

      if (!loan) {
        return new Response(
          JSON.stringify({ error: "Failed to create loan application" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ data: loan }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error creating loan:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create loan application" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
