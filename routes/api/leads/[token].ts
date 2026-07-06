import { Handlers } from "$fresh/server.ts";
import { queryOne } from "$db/client.ts";
import { execute } from "$db/client.ts";
import {
  farmerLeadsToCSV,
  farmLeadsToCSV,
  getFarmerLeads,
  getFarmLeads,
} from "$lib/leads.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const token = ctx.params.token;

    const link = await queryOne<{
      id: string;
      tenant_id: string;
      segment: string;
      export_type: string;
      format: string;
      expires_at: Date;
      max_access_count: number;
      access_count: number;
      is_active: boolean;
      label: string;
    }>(
      `SELECT id, tenant_id, segment, export_type, format, expires_at,
              max_access_count, access_count, is_active, label
       FROM lead_export_links
       WHERE token = $1`,
      [token],
    );

    if (!link) {
      return new Response(
        JSON.stringify({ error: "Link not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!link.is_active) {
      return new Response(
        JSON.stringify({ error: "This link has been deactivated" }),
        { status: 410, headers: { "Content-Type": "application/json" } },
      );
    }

    if (new Date(link.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This link has expired" }),
        { status: 410, headers: { "Content-Type": "application/json" } },
      );
    }

    if (link.access_count >= link.max_access_count) {
      return new Response(
        JSON.stringify({
          error: "Maximum access limit reached for this link",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    await execute(
      `UPDATE lead_export_links SET access_count = access_count + 1 WHERE id = $1`,
      [link.id],
    );

    if (link.export_type === "farmer") {
      const leads = await getFarmerLeads(link.tenant_id, link.segment);

      if (link.format === "csv") {
        return new Response(farmerLeadsToCSV(leads), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              `attachment; filename="farmer-leads-${link.segment}-${
                new Date().toISOString().split("T")[0]
              }.csv"`,
          },
        });
      }

      return new Response(
        JSON.stringify({
          label: link.label,
          exportType: "farmer",
          segment: link.segment,
          generatedAt: new Date().toISOString(),
          totalLeads: leads.length,
          leads,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const leads = await getFarmLeads(link.tenant_id, link.segment);

    if (link.format === "csv") {
      return new Response(farmLeadsToCSV(leads), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition":
            `attachment; filename="farm-leads-${link.segment}-${
              new Date().toISOString().split("T")[0]
            }.csv"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        label: link.label,
        exportType: "farm",
        segment: link.segment,
        generatedAt: new Date().toISOString(),
        totalLeads: leads.length,
        leads,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};
