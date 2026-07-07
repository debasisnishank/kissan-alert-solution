import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface ScanRow {
  id: string;
  crop_type: string | null;
  crop_identified: string | null;
  health_score: number | null;
  issues: unknown;
  created_at: Date;
}

interface ScanHistoryItem {
  id: string;
  cropLabel: string;
  healthScore: number | null;
  issueCount: number;
  createdAt: string;
}

interface ScanHistoryData {
  scans: ScanHistoryItem[];
}

export const handler: Handlers<ScanHistoryData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const rows = await query<ScanRow>(
      `SELECT id, crop_type, crop_identified, health_score, issues, created_at
       FROM crop_scans
       WHERE farmer_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 30`,
      [session.userId, session.tenantId],
    );

    return ctx.render({
      scans: rows.map((r) => ({
        id: r.id,
        cropLabel: r.crop_identified || r.crop_type || "Unknown crop",
        healthScore: r.health_score,
        issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
        createdAt: new Date(r.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      })),
    });
  },
};

function healthColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

export default function ScanHistoryPage({ data }: PageProps<ScanHistoryData>) {
  const { scans } = data;

  return (
    <AppShell title="Scan History" showBack>
      {scans.length === 0
        ? (
          <div class="text-center text-gray-500 py-12">
            <p>No scans yet.</p>
            <a
              href="/app/scan"
              class="text-primary-600 font-medium mt-2 inline-block"
            >
              Scan your first crop photo
            </a>
          </div>
        )
        : (
          <div class="space-y-3">
            {scans.map((scan) => (
              <div
                key={scan.id}
                class="bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center"
              >
                <img
                  src={`/api/scans/${scan.id}/image`}
                  alt={scan.cropLabel}
                  loading="lazy"
                  class="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-medium text-gray-900 truncate">
                      {scan.cropLabel}
                    </p>
                    <span
                      class={`text-sm font-bold flex-shrink-0 ${
                        healthColor(scan.healthScore)
                      }`}
                    >
                      {scan.healthScore != null
                        ? `${scan.healthScore}/100`
                        : "--"}
                    </span>
                  </div>
                  <p class="text-xs text-gray-500">
                    {scan.issueCount} issue{scan.issueCount === 1 ? "" : "s"}
                    {" "}
                    detected · {scan.createdAt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
    </AppShell>
  );
}
