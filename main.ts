/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

// Load .env only in local development (not on Deno Deploy)
if (!Deno.env.get("DENO_DEPLOYMENT_ID")) {
  const { load } = await import("$std/dotenv/mod.ts");
  await load({ allowEmptyValues: true, export: true });
}

// On Deno Deploy: Register cron jobs and KV queue handlers
if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
  // Register scheduled cron jobs
  await import("./cron.ts");

  // Initialize KV queue for async job processing
  const { initQueueHandlers } = await import("./workers/init.ts");
  await initQueueHandlers();
}

import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

await start(manifest, config);
