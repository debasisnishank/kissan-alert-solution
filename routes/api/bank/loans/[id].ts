import { Handlers } from "$fresh/server.ts";
import { getLoanById, updateLoanApplication } from "$lib/bank.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_READ);
    if (authError) return authError;

    const tenantId = ctx.state.session!.tenantId;
    const loanId = ctx.params.id;

    const loan = await getLoanById(loanId, tenantId);

    if (!loan) {
      return new Response(
        JSON.stringify({ error: "Loan not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ data: loan }),
      { headers: { "Content-Type": "application/json" } },
    );
  },

  async PUT(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.USER_UPDATE);
    if (authError) return authError;

    try {
      const tenantId = ctx.state.session!.tenantId;
      const userId = ctx.state.session!.userId;
      const loanId = ctx.params.id;

      const body = await req.json();
      const {
        status,
        approvedAmount,
        interestRate,
        agriScore,
        agriScoreBreakdown,
        riskCategory,
        assessmentNotes,
      } = body;

      const updates: Record<string, unknown> = {};

      if (status !== undefined) updates.status = status;
      if (approvedAmount !== undefined) updates.approvedAmount = approvedAmount;
      if (interestRate !== undefined) updates.interestRate = interestRate;
      if (agriScore !== undefined) {
        updates.agriScore = agriScore;
        updates.assessedBy = userId;
      }
      if (agriScoreBreakdown !== undefined) {
        updates.agriScoreBreakdown = agriScoreBreakdown;
      }
      if (riskCategory !== undefined) updates.riskCategory = riskCategory;
      if (assessmentNotes !== undefined) {
        updates.assessmentNotes = assessmentNotes;
      }

      if (status === "approved") {
        updates.approvedBy = userId;
      }

      const loan = await updateLoanApplication(loanId, tenantId, updates);

      if (!loan) {
        return new Response(
          JSON.stringify({ error: "Loan not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ data: loan }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error updating loan:", error);
      return new Response(
        JSON.stringify({ error: "Failed to update loan" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
