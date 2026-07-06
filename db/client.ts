import { Pool, PoolClient } from "postgres";
import { env } from "$utils/env.ts";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(env.DATABASE_URL, env.DATABASE_POOL_SIZE, true);
  }
  return pool;
}

export async function query<T>(
  sql: string,
  args?: unknown[],
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.queryObject<T>(sql, args);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function queryOne<T>(
  sql: string,
  args?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  args?: unknown[],
): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.queryObject(sql, args);
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.queryObject("BEGIN");
    const result = await fn(client);
    await client.queryObject("COMMIT");
    return result;
  } catch (error) {
    await client.queryObject("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
