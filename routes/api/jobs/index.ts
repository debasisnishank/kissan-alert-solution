import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import { type AuthState, requireRole } from "../../../middlewares/auth.ts";

const EnqueueJobInput = z.object({
  type: z.enum([
    "ingest_satellite_catalog",
    "extract_farm_features",
    "generate_advisories",
    "sync_market_prices",
    "crawl_news",
    "analyze_farm",
    "send_notification",
  ]),
  payload: z.record(z.unknown()),
  scheduledAt: z.string().datetime().optional(),
});

// Check if running on Deno Deploy
const isDenoDeloy = !!Deno.env.get("DENO_DEPLOYMENT_ID");

export const handler: Handlers<unknown, AuthState> = {
  async GET(req, ctx) {
    const authError = requireRole(ctx, ["admin", "tenant_admin"]);
    if (authError) return authError;

    const url = new URL(req.url);
    const jobId = url.searchParams.get("id");

    try {
      if (isDenoDeloy) {
        // On Deno Deploy, return failed jobs from KV
        const { getFailedJobs } = await import("$workers/kv-queue.ts");
        const failedJobs = await getFailedJobs(undefined, 50);
        return new Response(
          JSON.stringify({
            data: {
              mode: "kv-queue",
              failedJobs,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      // Local: use PostgreSQL queue
      const {
        getJobStatus,
        getPendingJobsCount,
        getRecentJobs,
      } = await import("$workers/queue.ts");

      if (jobId) {
        const job = await getJobStatus(jobId);
        if (!job) {
          return new Response(JSON.stringify({ error: "Job not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ data: job }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const [pendingCounts, recentJobs] = await Promise.all([
        getPendingJobsCount(),
        getRecentJobs(50),
      ]);

      return new Response(
        JSON.stringify({
          data: {
            mode: "postgres-queue",
            pendingCounts,
            recentJobs,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error fetching jobs:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  async POST(req, ctx) {
    const authError = requireRole(ctx, ["admin", "tenant_admin"]);
    if (authError) return authError;

    try {
      const body = await req.json();
      const input = EnqueueJobInput.parse(body);

      // Add tenant context to payload
      const payload = {
        ...input.payload,
        tenantId: ctx.state.session!.tenantId,
      };

      if (isDenoDeloy) {
        // On Deno Deploy, use KV queue
        const { enqueue } = await import("$workers/kv-queue.ts");
        const delay = input.scheduledAt
          ? new Date(input.scheduledAt).getTime() - Date.now()
          : 0;
        await enqueue(input.type, payload, { delay: Math.max(0, delay) });

        return new Response(
          JSON.stringify({
            data: { type: input.type, status: "enqueued", mode: "kv-queue" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      // Local: use PostgreSQL queue
      const { enqueueJob } = await import("$workers/queue.ts");
      const job = await enqueueJob(input.type, payload, {
        scheduledAt: input.scheduledAt
          ? new Date(input.scheduledAt)
          : undefined,
      });

      return new Response(JSON.stringify({ data: job }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: "Validation error", details: error.errors }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      console.error("Error enqueueing job:", error);
      return new Response(JSON.stringify({ error: "Failed to enqueue job" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
