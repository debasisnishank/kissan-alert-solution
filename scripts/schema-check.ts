import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });
const { closePool, query } = await import("../db/client.ts");

const cols = await query<{ column_name: string }>(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'farms'",
);
console.log("Farms columns:", cols.map((c) => c.column_name).join(", "));
await closePool();
