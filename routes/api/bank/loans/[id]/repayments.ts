import { Handlers } from "$fresh/server.ts";
import {
  createRepayment,
  getLoanById,
  listRepaymentsByLoan,
  logBankAudit,
} from "$lib/bank.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_READ);
    if (authError) return authError;

    const loanId = ctx.params.id;
    const tenantId = ctx.state.session!.tenantId;

    // Verify loan exists and belongs to tenant
    const loan = await getLoanById(loanId, tenantId);
    if (!loan) {
      return new Response(JSON.stringify({ error: "Loan not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const repayments = await listRepaymentsByLoan(loanId);

    return new Response(JSON.stringify({ data: repayments }), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async POST(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_CREATE);
    if (authError) return authError;

    try {
      const loanId = ctx.params.id;
      const tenantId = ctx.state.session!.tenantId;
      const userId = ctx.state.session!.userId;

      // Verify loan exists and is disbursed
      const loan = await getLoanById(loanId, tenantId);
      if (!loan) {
        return new Response(JSON.stringify({ error: "Loan not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (loan.status !== "disbursed") {
        return new Response(
          JSON.stringify({
            error: "Can only add repayments to disbursed loans",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const body = await req.json();
      const {
        amount,
        principal,
        interest,
        paymentDate,
        paymentMethod,
        referenceNumber,
        notes,
      } = body;

      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({ error: "Valid amount is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const repayment = await createRepayment({
        loanId,
        amount,
        principal,
        interest,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod,
        referenceNumber,
        notes,
      });

      if (!repayment) {
        return new Response(
          JSON.stringify({ error: "Failed to create repayment" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      // Log audit
      await logBankAudit({
        tenantId,
        userId,
        entityType: "repayment",
        entityId: repayment.id,
        action: "create",
        newValues: { amount, principal, interest, paymentMethod },
      });

      return new Response(JSON.stringify({ data: repayment }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error creating repayment:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create repayment" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
