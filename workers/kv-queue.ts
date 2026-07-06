/**
 * Deno KV Queue for Deno Deploy
 * Uses Deno.openKv() for serverless job processing
 */

export interface QueueMessage {
  type: string;
  payload: Record<string, unknown>;
  attempts?: number;
  maxAttempts?: number;
  scheduledAt?: number;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

// Job handlers registry
const handlers: Map<string, JobHandler> = new Map();

// KV instance (lazy loaded)
let kv: Deno.Kv | null = null;

async function getKv(): Promise<Deno.Kv> {
  if (!kv) {
    kv = await Deno.openKv();
  }
  return kv;
}

/**
 * Register a job handler
 */
export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
  console.log(`[KV-QUEUE] Registered handler for: ${type}`);
}

/**
 * Enqueue a job to be processed
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: { delay?: number; maxAttempts?: number } = {},
): Promise<void> {
  const { delay = 0, maxAttempts = 3 } = options;

  const message: QueueMessage = {
    type,
    payload,
    attempts: 0,
    maxAttempts,
    scheduledAt: Date.now() + delay,
  };

  const kvInstance = await getKv();
  await kvInstance.enqueue(message, { delay });
  console.log(`[KV-QUEUE] Enqueued job: ${type}`);
}

/**
 * Start listening for queue messages
 * Call this once in main.ts for Deno Deploy
 */
export async function startQueueListener(): Promise<void> {
  const kvInstance = await getKv();

  console.log("[KV-QUEUE] Starting queue listener...");

  kvInstance.listenQueue(async (message: QueueMessage) => {
    const { type, payload, attempts = 0, maxAttempts = 3 } = message;

    console.log(`[KV-QUEUE] Processing job: ${type} (attempt ${attempts + 1})`);

    const handler = handlers.get(type);
    if (!handler) {
      console.error(`[KV-QUEUE] No handler for job type: ${type}`);
      return;
    }

    try {
      await handler(payload);
      console.log(`[KV-QUEUE] Job completed: ${type}`);
    } catch (error) {
      console.error(`[KV-QUEUE] Job failed: ${type}`, error);

      // Retry with exponential backoff
      if (attempts + 1 < maxAttempts) {
        const backoffMs = Math.pow(2, attempts + 1) * 1000; // 2s, 4s, 8s...
        console.log(
          `[KV-QUEUE] Retrying ${type} in ${backoffMs / 1000}s (attempt ${
            attempts + 2
          }/${maxAttempts})`,
        );

        await enqueue(type, payload, {
          delay: backoffMs,
          maxAttempts,
        });
      } else {
        console.error(`[KV-QUEUE] Job permanently failed: ${type}`);
        // Optionally store failed jobs for inspection
        await kvInstance.set(
          ["failed_jobs", type, Date.now().toString()],
          {
            type,
            payload,
            error: error instanceof Error ? error.message : String(error),
            failedAt: new Date().toISOString(),
          },
          { expireIn: 7 * 24 * 60 * 60 * 1000 }, // 7 days
        );
      }
    }
  });
}

/**
 * Get failed jobs for inspection
 */
export async function getFailedJobs(
  type?: string,
  limit = 100,
): Promise<
  Array<{ type: string; payload: unknown; error: string; failedAt: string }>
> {
  const kvInstance = await getKv();
  const prefix = type ? ["failed_jobs", type] : ["failed_jobs"];
  const jobs: Array<
    { type: string; payload: unknown; error: string; failedAt: string }
  > = [];

  for await (const entry of kvInstance.list({ prefix })) {
    jobs.push(
      entry.value as {
        type: string;
        payload: unknown;
        error: string;
        failedAt: string;
      },
    );
    if (jobs.length >= limit) break;
  }

  return jobs;
}

/**
 * Clear failed jobs
 */
export async function clearFailedJobs(type?: string): Promise<number> {
  const kvInstance = await getKv();
  const prefix = type ? ["failed_jobs", type] : ["failed_jobs"];
  let count = 0;

  for await (const entry of kvInstance.list({ prefix })) {
    await kvInstance.delete(entry.key);
    count++;
  }

  return count;
}
