#!/usr/bin/env -S deno run -A
import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

const { closePool, query } = await import("../db/client.ts");

console.log("Checking database connection...\n");

try {
  // Check farms
  const farms = await query<{
    id: string;
    name: string;
    area_hectares: number;
    district: string;
    state: string;
  }>(
    `SELECT id, name, area_hectares, district, state FROM farms LIMIT 10`,
  );
  console.log(`Farms: ${farms.length}`);
  for (const f of farms) {
    console.log(
      `  - ${f.name} (${f.area_hectares} ha) in ${f.district}, ${f.state}`,
    );
  }

  // Check crop declarations
  const crops = await query<{
    farm_name: string;
    crop_type: string;
    sowing_date: Date;
    season: string;
  }>(
    `SELECT f.name as farm_name, c.crop_type, c.sowing_date, c.season 
     FROM crop_declarations c 
     JOIN farms f ON c.farm_id = f.id 
     WHERE c.is_active = true LIMIT 10`,
  );
  console.log(`\nActive Crops: ${crops.length}`);
  for (const c of crops) {
    console.log(
      `  - ${c.crop_type} on ${c.farm_name} (${c.season}, sown: ${c.sowing_date})`,
    );
  }

  // Check observations
  const obsCount = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM farm_observations`,
  );
  console.log(`\nObservations: ${obsCount[0]?.count || 0}`);

  // Check alerts
  const alertCount = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM alerts WHERE status = 'active'`,
  );
  console.log(`Active Alerts: ${alertCount[0]?.count || 0}`);

  // Check users
  const users = await query<{ role: string; count: number }>(
    `SELECT role, COUNT(*) as count FROM users GROUP BY role`,
  );
  console.log(`\nUsers by role:`);
  for (const u of users) {
    console.log(`  - ${u.role}: ${u.count}`);
  }

  console.log("\n✓ Database connection successful!");
} catch (error) {
  console.error("Database error:", error);
} finally {
  await closePool();
}
