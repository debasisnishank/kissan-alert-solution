import { Handlers } from "$fresh/server.ts";
import { query } from "$db/client.ts";
import { enqueueJob } from "$workers/queue.ts";
import {
  type AuthState,
  requirePermission,
} from "../../../middlewares/auth.ts";
import { PERMISSIONS } from "$utils/constants.ts";

interface ScheduleJobPayload {
  jobType:
    | "sync_all_farms"
    | "sync_market_prices"
    | "ingest_satellite"
    | "generate_advisories";
  options?: Record<string, unknown>;
}

export const handler: Handlers<unknown, AuthState> = {
  async POST(req, ctx) {
    // Only admins can schedule jobs
    const authError = requirePermission(ctx, PERMISSIONS.JOB_MANAGE);
    if (authError) return authError;

    try {
      const body: ScheduleJobPayload = await req.json();
      const { session } = ctx.state;
      const tenantId = session!.tenantId;

      const jobIds: string[] = [];

      switch (body.jobType) {
        case "sync_all_farms": {
          // Get all farms and schedule feature extraction for each
          const farms = await query<{ id: string }>(
            `SELECT id FROM farms WHERE tenant_id = $1 AND is_active = true`,
            [tenantId],
          );

          const today = new Date();
          const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];
          const endDate = today.toISOString().split("T")[0];

          for (const farm of farms) {
            const job = await enqueueJob("extract_farm_features", {
              farmId: farm.id,
              startDate,
              endDate,
            });
            jobIds.push(job.id);
          }
          break;
        }

        case "sync_market_prices": {
          const job = await enqueueJob("sync_market_prices", {
            limit: 500,
            ...body.options,
          });
          jobIds.push(job.id);
          break;
        }

        case "ingest_satellite": {
          // Get bounding box of all farms
          const bbox = await query<{
            min_lon: number;
            min_lat: number;
            max_lon: number;
            max_lat: number;
          }>(
            `SELECT 
              MIN(ST_XMin(ST_Envelope(polygon))) as min_lon,
              MIN(ST_YMin(ST_Envelope(polygon))) as min_lat,
              MAX(ST_XMax(ST_Envelope(polygon))) as max_lon,
              MAX(ST_YMax(ST_Envelope(polygon))) as max_lat
             FROM farms WHERE tenant_id = $1 AND is_active = true`,
            [tenantId],
          );

          if (bbox.length > 0 && bbox[0].min_lon) {
            const today = new Date();
            const startDate = new Date(
              today.getTime() - 30 * 24 * 60 * 60 * 1000,
            )
              .toISOString()
              .split("T")[0];
            const endDate = today.toISOString().split("T")[0];

            const jobId = await enqueueJob("ingest_satellite_catalog", {
              source: "all",
              bbox: {
                minLon: bbox[0].min_lon,
                minLat: bbox[0].min_lat,
                maxLon: bbox[0].max_lon,
                maxLat: bbox[0].max_lat,
              },
              startDate,
              endDate,
              maxCloudCover: 40,
            });
            jobIds.push(job.id);
          }
          break;
        }

        case "generate_advisories": {
          const farms = await query<{ id: string }>(
            `SELECT id FROM farms WHERE tenant_id = $1 AND is_active = true`,
            [tenantId],
          );

          for (const farm of farms) {
            const job = await enqueueJob("generate_advisories", {
              farmId: farm.id,
            });
            jobIds.push(job.id);
          }
          break;
        }

        default:
          return new Response(
            JSON.stringify({ error: "Invalid job type" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
      }

      return new Response(
        JSON.stringify({
          data: {
            jobType: body.jobType,
            jobsScheduled: jobIds.length,
            jobIds,
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Failed to schedule job:", error);
      return new Response(
        JSON.stringify({ error: "Failed to schedule job" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
