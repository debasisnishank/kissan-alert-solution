#!/usr/bin/env -S deno run -A --watch=static/,routes/

// Load .env only in local development (not on Deno Deploy)
if (!Deno.env.get("DENO_DEPLOYMENT_ID")) {
  const { load } = await import("$std/dotenv/mod.ts");
  await load({ allowEmptyValues: true, export: true });
}

import dev from "$fresh/dev.ts";
import config from "./fresh.config.ts";

await dev(import.meta.url, "./main.ts", config);
