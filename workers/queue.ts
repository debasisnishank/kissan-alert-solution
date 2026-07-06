import { execute, query, queryOne } from "$db/client.ts";
import type { Job } from "$utils/types.ts";

interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
  result: unknown;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    status: row.status as Job["status"],
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    error: row.error ?? undefined,
    result: row.result,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function enqueueJob<T>(
  type: string,
  payload: T,
  options: { scheduledAt?: Date; maxAttempts?: number } = {},
): Promise<Job<T>> {
  const { scheduledAt = new Date(), maxAttempts = 3 } = options;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO jobs (type, payload, scheduled_at, max_attempts)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [type, JSON.stringify(payload), scheduledAt, maxAttempts],
  );

  if (!result) throw new Error("Failed to enqueue job");

  return {
    id: result.id,
    type,
    payload,
    status: "pending",
    attempts: 0,
    maxAttempts,
    scheduledAt,
    createdAt: new Date(),
  };
}

export async function dequeueJob(types?: string[]): Promise<Job | null> {
  let whereClause =
    "status = 'pending' AND scheduled_at <= NOW() AND attempts < max_attempts";
  const params: unknown[] = [];

  if (types && types.length > 0) {
    params.push(types);
    whereClause += ` AND type = ANY($${params.length})`;
  }

  // Use FOR UPDATE SKIP LOCKED for concurrent workers
  const result = await queryOne<JobRow>(
    `UPDATE jobs
     SET status = 'processing', started_at = NOW(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE ${whereClause}
       ORDER BY scheduled_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, type, payload, status, attempts, max_attempts, error, result,
               scheduled_at, started_at, completed_at, created_at`,
    params,
  );

  if (!result) return null;
  return rowToJob(result);
}

export async function completeJob(id: string, result?: unknown): Promise<void> {
  await execute(
    `UPDATE jobs SET status = 'completed', completed_at = NOW(), result = $1
     WHERE id = $2`,
    [result ? JSON.stringify(result) : null, id],
  );
}

export async function failJob(id: string, error: string): Promise<void> {
  // Check if we should retry
  const job = await queryOne<{ attempts: number; max_attempts: number }>(
    `SELECT attempts, max_attempts FROM jobs WHERE id = $1`,
    [id],
  );

  if (job && job.attempts < job.max_attempts) {
    // Retry with exponential backoff
    const backoffMinutes = Math.pow(2, job.attempts);
    await execute(
      `UPDATE jobs SET status = 'pending', error = $1, 
       scheduled_at = NOW() + INTERVAL '${backoffMinutes} minutes'
       WHERE id = $2`,
      [error, id],
    );
  } else {
    await execute(
      `UPDATE jobs SET status = 'failed', error = $1, completed_at = NOW()
       WHERE id = $2`,
      [error, id],
    );
  }
}

export async function getJobStatus(id: string): Promise<Job | null> {
  const result = await queryOne<JobRow>(
    `SELECT id, type, payload, status, attempts, max_attempts, error, result,
            scheduled_at, started_at, completed_at, created_at
     FROM jobs WHERE id = $1`,
    [id],
  );

  if (!result) return null;
  return rowToJob(result);
}

export async function getPendingJobsCount(): Promise<Record<string, number>> {
  const results = await query<{ type: string; count: number }>(
    `SELECT type, COUNT(*) as count FROM jobs
     WHERE status = 'pending' GROUP BY type`,
  );

  const counts: Record<string, number> = {};
  for (const row of results) {
    counts[row.type] = Number(row.count);
  }
  return counts;
}

export async function getRecentJobs(
  limit = 100,
  status?: Job["status"],
): Promise<Job[]> {
  let whereClause = "1=1";
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    whereClause = `status = $${params.length}`;
  }

  params.push(limit);

  const results = await query<JobRow>(
    `SELECT id, type, payload, status, attempts, max_attempts, error, result,
            scheduled_at, started_at, completed_at, created_at
     FROM jobs WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return results.map(rowToJob);
}

export async function cleanupOldJobs(daysToKeep = 30): Promise<number> {
  const result = await execute(
    `DELETE FROM jobs
     WHERE status IN ('completed', 'failed')
     AND completed_at < NOW() - INTERVAL '${daysToKeep} days'`,
  );
  return result;
}
