import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.220.1/assert/mod.ts";

// Test NDVI/EVI calculation
Deno.test("NDVI calculation", () => {
  // NDVI = (NIR - Red) / (NIR + Red)
  const calculateNDVI = (nir: number, red: number): number => {
    if (nir + red === 0) return 0;
    return (nir - red) / (nir + red);
  };

  // Healthy vegetation: high NIR, low Red
  const healthyNDVI = calculateNDVI(0.5, 0.1);
  assert(healthyNDVI > 0.5, "Healthy vegetation should have NDVI > 0.5");

  // Bare soil: similar NIR and Red
  const soilNDVI = calculateNDVI(0.2, 0.2);
  assertEquals(soilNDVI, 0, "Bare soil should have NDVI ~ 0");

  // Water: negative NDVI
  const waterNDVI = calculateNDVI(0.05, 0.1);
  assert(waterNDVI < 0, "Water should have negative NDVI");
});

Deno.test("EVI calculation", () => {
  // EVI = 2.5 * (NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1)
  const calculateEVI = (nir: number, red: number, blue: number): number => {
    const denominator = nir + 6 * red - 7.5 * blue + 1;
    if (denominator === 0) return 0;
    return 2.5 * (nir - red) / denominator;
  };

  // Healthy vegetation
  const healthyEVI = calculateEVI(0.5, 0.1, 0.05);
  assert(healthyEVI > 0, "Healthy vegetation should have positive EVI");
  assert(healthyEVI < 1, "EVI should be less than 1");
});

Deno.test("Crop stage estimation from days after sowing", () => {
  const estimateCropStage = (daysAfterSowing: number): string => {
    if (daysAfterSowing < 15) return "Germination";
    if (daysAfterSowing < 30) return "Seedling";
    if (daysAfterSowing < 50) return "Vegetative";
    if (daysAfterSowing < 70) return "Flowering";
    if (daysAfterSowing < 90) return "Pod Formation";
    return "Maturity";
  };

  assertEquals(estimateCropStage(5), "Germination");
  assertEquals(estimateCropStage(20), "Seedling");
  assertEquals(estimateCropStage(40), "Vegetative");
  assertEquals(estimateCropStage(60), "Flowering");
  assertEquals(estimateCropStage(80), "Pod Formation");
  assertEquals(estimateCropStage(100), "Maturity");
});

Deno.test("Weather alert severity logic", () => {
  const checkRainfallAlert = (
    precipitation: number,
  ): { type: string; severity: string } | null => {
    if (precipitation > 100) {
      return { type: "heavy_rain", severity: "critical" };
    }
    if (precipitation > 50) {
      return { type: "heavy_rain", severity: "high" };
    }
    return null;
  };

  const critical = checkRainfallAlert(150);
  assertExists(critical);
  assertEquals(critical.severity, "critical");

  const high = checkRainfallAlert(75);
  assertExists(high);
  assertEquals(high.severity, "high");

  const none = checkRainfallAlert(20);
  assertEquals(none, null);
});

Deno.test("Market price trend calculation", () => {
  const calculateTrend = (
    currentPrice: number,
    previousPrice: number,
  ): "up" | "down" | "stable" => {
    const change = ((currentPrice - previousPrice) / previousPrice) * 100;
    if (change > 2) return "up";
    if (change < -2) return "down";
    return "stable";
  };

  assertEquals(calculateTrend(4500, 4000), "up"); // +12.5%
  assertEquals(calculateTrend(4000, 4500), "down"); // -11%
  assertEquals(calculateTrend(4010, 4000), "stable"); // +0.25%
});

Deno.test("Polygon centroid calculation", () => {
  const getPolygonCentroid = (
    coordinates: number[][],
  ): { lat: number; lon: number } => {
    let lat = 0;
    let lon = 0;
    for (const [x, y] of coordinates) {
      lon += x;
      lat += y;
    }
    return {
      lat: lat / coordinates.length,
      lon: lon / coordinates.length,
    };
  };

  const coords = [
    [74.0, 18.5],
    [74.1, 18.5],
    [74.1, 18.6],
    [74.0, 18.6],
    [74.0, 18.5], // closed
  ];

  const centroid = getPolygonCentroid(coords);
  assert(centroid.lat > 18.5 && centroid.lat < 18.6);
  assert(centroid.lon > 74.0 && centroid.lon < 74.1);
});

Deno.test("Bounding box from polygon", () => {
  const getBBox = (
    coordinates: number[][],
  ): { minLon: number; minLat: number; maxLon: number; maxLat: number } => {
    const lons = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);
    return {
      minLon: Math.min(...lons),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lons),
      maxLat: Math.max(...lats),
    };
  };

  const coords = [
    [74.0, 18.5],
    [74.1, 18.5],
    [74.1, 18.6],
    [74.0, 18.6],
  ];

  const bbox = getBBox(coords);
  assertEquals(bbox.minLon, 74.0);
  assertEquals(bbox.maxLon, 74.1);
  assertEquals(bbox.minLat, 18.5);
  assertEquals(bbox.maxLat, 18.6);
});
