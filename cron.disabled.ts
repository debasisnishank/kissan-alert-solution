// Deno Cron Jobs for Compass Agricultural Platform
//
// NOTE: This file uses Deno.cron which is an UNSTABLE API
// To use this file, you need to:
// 1. Run with --unstable flag: deno run --unstable cron.ts
// 2. Or add to deno.json: "unstable": ["cron"]
// 3. Or use Deno Deploy which supports cron natively
//
// For production without Deno Deploy, consider using:
// - External cron service (GitHub Actions, cron-job.org)
// - Job queue system (already implemented in workers/)
// - Traditional cron on your server
//
// This file has been renamed to cron.disabled.ts to prevent CI/CD errors
// Rename back to cron.ts when deploying to Deno Deploy

export {}; // Make this a module
