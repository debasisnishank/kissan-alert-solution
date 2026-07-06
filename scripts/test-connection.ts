import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { load } from "https://deno.land/std@0.220.0/dotenv/mod.ts";

await load({ export: true, allowEmptyValues: true });

const DATABASE_URL = Deno.env.get("DATABASE_URL") || "";
console.log(
  "Database URL (masked):",
  DATABASE_URL.replace(/:[^@]+@/, ":****@"),
);

try {
  console.log("\nTesting database connection...");
  const pool = new Pool(DATABASE_URL, 1, true);
  const client = await pool.connect();
  const result = await client.queryObject<{ version: string }>(
    "SELECT version()",
  );
  console.log("✓ Connected to database!");
  console.log("PostgreSQL version:", result.rows[0]?.version);

  // Check if tables exist
  const tables = await client.queryObject<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  console.log(
    "\nExisting tables:",
    tables.rows.map((t) => t.tablename).join(", ") || "none",
  );

  client.release();
  await pool.end();
  console.log("\n✓ Connection test passed!");
} catch (e) {
  console.error("✗ Connection failed:", e.message);
  Deno.exit(1);
}
