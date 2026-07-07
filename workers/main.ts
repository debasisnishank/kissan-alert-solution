import { load } from "$std/dotenv/mod.ts";

// Load environment variables FIRST, before any other imports
await load({ allowEmptyValues: true, export: true });

// Dynamic imports to ensure env is loaded first
const { cleanupOldJobs, completeJob, dequeueJob, failJob } = await import(
  "./queue.ts"
);
const { handleIngestSatelliteCatalog } = await import(
  "./handlers/ingest_satellite.ts"
);
const { handleExtractFarmFeatures } = await import(
  "./handlers/extract_features.ts"
);
const { handleGenerateAdvisories } = await import(
  "./handlers/generate_advisories.ts"
);
const { handleSyncMarketPrices } = await import(
  "./handlers/sync_market_prices.ts"
);

// Job type handlers
const JOB_HANDLERS: Record<string, (payload: unknown) => Promise<unknown>> = {
  ingest_satellite_catalog: handleIngestSatelliteCatalog as (
    payload: unknown,
  ) => Promise<unknown>,
  extract_farm_features: handleExtractFarmFeatures as (
    payload: unknown,
  ) => Promise<unknown>,
  generate_advisories: handleGenerateAdvisories as (
    payload: unknown,
  ) => Promise<unknown>,
  sync_market_prices: handleSyncMarketPrices as (
    payload: unknown,
  ) => Promise<unknown>,
};

const POLL_INTERVAL_MS = 5000; // 5 seconds
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let isRunning = true;

async function processJobs() {
  console.log("[WORKER] Starting job processor...");

  while (isRunning) {
    try {
      const job = await dequeueJob(Object.keys(JOB_HANDLERS));

      if (job) {
        console.log(
          `[WORKER] Processing job ${job.id} (${job.type}), attempt ${job.attempts}`,
        );

        const handler = JOB_HANDLERS[job.type];
        if (!handler) {
          console.error(`[WORKER] No handler for job type: ${job.type}`);
          await failJob(job.id, `Unknown job type: ${job.type}`);
          continue;
        }

        try {
          const result = await handler(job.payload);
          await completeJob(job.id, result);
          console.log(`[WORKER] Job ${job.id} completed successfully`);
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
          await failJob(job.id, errorMessage);
        }
      } else {
        // No jobs available, wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error("[WORKER] Error in job loop:", error);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

async function periodicCleanup() {
  while (isRunning) {
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_INTERVAL_MS));
    try {
      const deleted = await cleanupOldJobs(30);
      console.log(`[WORKER] Cleaned up ${deleted} old jobs`);
    } catch (error) {
      console.error("[WORKER] Cleanup error:", error);
    }
  }
}

// Handle shutdown gracefully
Deno.addSignalListener("SIGINT", () => {
  console.log("[WORKER] Received SIGINT, shutting down...");
  isRunning = false;
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("[WORKER] Received SIGTERM, shutting down...");
  isRunning = false;
});

// Start worker
console.log("[WORKER] Khetscope Worker starting...");
console.log(
  `[WORKER] Registered job types: ${Object.keys(JOB_HANDLERS).join(", ")}`,
);

// Run both in parallel
await Promise.all([
  processJobs(),
  periodicCleanup(),
]);

console.log("[WORKER] Worker stopped");
