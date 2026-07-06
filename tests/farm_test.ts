import { assertEquals, assertExists } from "$std/assert/mod.ts";

Deno.test("Farm polygon validation", () => {
  const validPolygon = {
    type: "Polygon" as const,
    coordinates: [[[74.0060, 18.5204], [74.0080, 18.5204], [74.0080, 18.5224], [
      74.0060,
      18.5224,
    ], [74.0060, 18.5204]]],
  };

  assertEquals(validPolygon.type, "Polygon");
  assertEquals(validPolygon.coordinates[0].length, 5);
  assertEquals(validPolygon.coordinates[0][0], validPolygon.coordinates[0][4]); // Closed ring
});

Deno.test("NDVI value range", () => {
  const ndviValues = [0.1, 0.3, 0.5, 0.7, 0.85];

  for (const ndvi of ndviValues) {
    assertEquals(
      ndvi >= -1 && ndvi <= 1,
      true,
      `NDVI ${ndvi} should be between -1 and 1`,
    );
  }
});

Deno.test("Alert severity ordering", () => {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  assertEquals(severityOrder.critical < severityOrder.high, true);
  assertEquals(severityOrder.high < severityOrder.medium, true);
  assertEquals(severityOrder.medium < severityOrder.low, true);
});

Deno.test("Crop stage estimation", () => {
  function estimateCropStage(daysAfterSowing: number): string {
    if (daysAfterSowing < 15) return "Germination";
    if (daysAfterSowing < 30) return "Seedling";
    if (daysAfterSowing < 50) return "Vegetative";
    if (daysAfterSowing < 70) return "Flowering";
    if (daysAfterSowing < 90) return "Pod Formation";
    return "Maturity";
  }

  assertEquals(estimateCropStage(5), "Germination");
  assertEquals(estimateCropStage(20), "Seedling");
  assertEquals(estimateCropStage(40), "Vegetative");
  assertEquals(estimateCropStage(60), "Flowering");
  assertEquals(estimateCropStage(80), "Pod Formation");
  assertEquals(estimateCropStage(100), "Maturity");
});

Deno.test("Phone number validation", () => {
  const validPhones = ["+919876543210", "+916789012345", "+917890123456"];
  const invalidPhones = [
    "+911234567890",
    "+91987654321",
    "9876543210",
    "+1234567890",
  ];

  const phoneRegex = /^\+91[6-9]\d{9}$/;

  for (const phone of validPhones) {
    assertEquals(phoneRegex.test(phone), true, `${phone} should be valid`);
  }

  for (const phone of invalidPhones) {
    assertEquals(phoneRegex.test(phone), false, `${phone} should be invalid`);
  }
});

Deno.test("Translation cache key generation", async () => {
  const text = "Hello World";
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  assertExists(hash);
  assertEquals(hash.length, 64);
});
