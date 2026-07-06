import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

import { closePool, query } from "../db/client.ts";
import {
  checkWeatherAlerts,
  getDailyWeather,
} from "../lib/satellite/weather.ts";

// Get farm polygon
const farms = await query<{ name: string; polygon_geojson: string }>(
  `SELECT name, ST_AsGeoJSON(polygon) as polygon_geojson FROM farms LIMIT 1`,
);

if (farms.length === 0) {
  console.log("No farms found");
  Deno.exit(1);
}

const farm = farms[0];
console.log(`Testing weather for: ${farm.name}`);

const polygon = JSON.parse(farm.polygon_geojson);
console.log("Polygon:", JSON.stringify(polygon.coordinates[0].slice(0, 2)));

// Calculate centroid
const coords = polygon.coordinates[0];
const centroid = {
  lat: coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length,
  lon: coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length,
};
console.log("Centroid:", centroid);

// Test weather API
const today = new Date();
const startDate = today.toISOString().split("T")[0];
const endDate =
  new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split(
    "T",
  )[0];

console.log(`\nFetching weather: ${startDate} to ${endDate}`);

try {
  const weather = await getDailyWeather({
    lat: centroid.lat,
    lon: centroid.lon,
    startDate,
    endDate,
  });
  console.log("Weather data:", weather);
} catch (e) {
  console.error("Weather error:", e);
}

console.log("\nChecking alerts...");
try {
  const alerts = await checkWeatherAlerts(centroid.lat, centroid.lon);
  console.log("Alerts:", alerts);
} catch (e) {
  console.error("Alert error:", e);
}

await closePool();
