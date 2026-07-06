import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });
const { getPool } = await import("./client.ts");
import { migrations } from "./migrate.ts";

async function reset() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Resetting database...");

    // Run down migrations in reverse order
    for (const migration of [...migrations].reverse()) {
      console.log(
        `Rolling back migration ${migration.version}: ${migration.name}`,
      );
      try {
        await client.queryObject(migration.down);
      } catch (error) {
        console.warn(
          `Warning rolling back migration ${migration.version}:`,
          error,
        );
      }
    }

    console.log("Database reset complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  await reset();
}

export { reset };
