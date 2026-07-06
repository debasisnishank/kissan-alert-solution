import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import { query, queryOne } from "$db/client.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

const CreateTicketInput = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10),
  category: z.enum(["pest", "disease", "nutrient", "irrigation", "general"]),
  farmId: z.string().uuid().optional(),
});

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.TICKET_CREATE);
    if (authError) return authError;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const { session } = ctx.state;
    let whereClause = "farmer_id = $1 AND tenant_id = $2";
    const params: unknown[] = [session!.userId, session!.tenantId];

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const tickets = await query<{
      id: string;
      subject: string;
      description: string;
      category: string;
      status: string;
      priority: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, subject, description, category, status, priority, created_at, updated_at
       FROM expert_tickets
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );

    return new Response(JSON.stringify({ data: tickets }), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async POST(req, ctx) {
    const authError = requirePermission(ctx, PERMISSIONS.TICKET_CREATE);
    if (authError) return authError;

    try {
      const body = await req.json();
      const input = CreateTicketInput.parse(body);
      const { session } = ctx.state;

      const result = await queryOne<{ id: string }>(
        `INSERT INTO expert_tickets (tenant_id, farmer_id, farm_id, subject, description, category)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          session!.tenantId,
          session!.userId,
          input.farmId || null,
          input.subject,
          input.description,
          input.category,
        ],
      );

      if (!result) {
        throw new Error("Failed to create ticket");
      }

      return new Response(JSON.stringify({ data: { id: result.id } }), {
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

      console.error("Error creating ticket:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create ticket" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
