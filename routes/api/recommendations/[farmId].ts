import { Handlers } from "$fresh/server.ts";
import { query } from "$db/client.ts";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface Recommendation {
  id: string;
  category: string;
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
  timing: string;
  products?: Array<{
    name: string;
    manufacturer: string;
    dosage: string;
    price?: number;
  }>;
}

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { farmId } = ctx.params;
    const { session } = ctx.state;

    const farm = await getFarmById(farmId, session.tenantId);
    if (!farm) {
      return new Response(JSON.stringify({ error: "Farm not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [crop, stats] = await Promise.all([
      getActiveCropByFarm(farmId),
      getFarmHealthStats(farmId),
    ]);

    const cropType = crop?.cropType || "wheat";
    const healthScore = Number(stats.healthScore) || 50;

    let daysAfterSowing = 0;
    let stage = "vegetative";
    if (crop) {
      daysAfterSowing = Math.floor(
        (Date.now() - new Date(crop.sowingDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (daysAfterSowing < 15) stage = "germination";
      else if (daysAfterSowing < 30) stage = "seedling";
      else if (daysAfterSowing < 50) stage = "vegetative";
      else if (daysAfterSowing < 70) stage = "flowering";
      else if (daysAfterSowing < 90) stage = "fruiting";
      else stage = "maturity";
    }

    // Get weather context
    let weatherData = { temperature: 30, rainfall7d: 0, humidity: 60 };
    try {
      let lat = 20.5937, lon = 78.9629;
      if (farm.polygon?.coordinates?.[0]) {
        const coords = farm.polygon.coordinates[0];
        lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) /
          coords.length;
        lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) /
          coords.length;
      }

      const weather = await getDailyWeather({
        lat,
        lon,
        startDate: new Date().toISOString().split("T")[0],
        endDate:
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split(
            "T",
          )[0],
      });

      if (weather.length > 0) {
        weatherData = {
          temperature: Math.round(
            weather.reduce((s, w) => s + w.temperatureMax, 0) / weather.length,
          ),
          rainfall7d: Math.round(
            weather.reduce((s, w) => s + w.precipitation, 0),
          ),
          humidity: 60,
        };
      }
    } catch { /* use defaults */ }

    // Try AI-powered recommendations
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    let recommendations: Recommendation[] = [];

    if (apiKey) {
      try {
        recommendations = await getAIRecommendations(
          apiKey,
          cropType,
          stage,
          daysAfterSowing,
          healthScore,
          weatherData,
          farm.district || "India",
        );
      } catch (error) {
        console.error("AI recommendations failed:", error);
      }
    }

    // Fallback to product-based if AI fails
    if (recommendations.length === 0) {
      recommendations = await getProductBasedRecommendations(
        cropType,
        stage,
        healthScore,
        weatherData,
      );
    }

    return new Response(
      JSON.stringify({
        farmId,
        farmName: farm.name,
        cropType,
        stage,
        daysAfterSowing,
        healthScore,
        weather: weatherData,
        recommendations,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};

async function getAIRecommendations(
  apiKey: string,
  cropType: string,
  stage: string,
  daysAfterSowing: number,
  healthScore: number,
  weather: { temperature: number; rainfall7d: number; humidity: number },
  location: string,
): Promise<Recommendation[]> {
  const prompt =
    `You are an expert Indian agricultural advisor. Generate specific recommendations for this farm.

FARM CONTEXT:
- Crop: ${cropType}
- Growth Stage: ${stage} (Day ${daysAfterSowing} after sowing)
- Health Score: ${healthScore}/100
- Location: ${location}, India
- Weather: Temperature ${weather.temperature}°C, Rainfall (7 days): ${weather.rainfall7d}mm

GENERATE 4-6 ACTIONABLE RECOMMENDATIONS covering:
1. Immediate needs based on crop stage
2. Irrigation schedule
3. Fertilizer application (if needed)
4. Pest/disease prevention
5. Harvest preparation (if approaching maturity)

For each recommendation include:
- Specific Indian products (IFFCO, Coromandel, UPL, Bayer, Syngenta, Tata Rallis, etc.)
- Exact dosage in Indian units (kg/acre, ml/litre, gm/litre)
- Best timing for application

RESPOND IN EXACT JSON FORMAT:
{
  "recommendations": [
    {
      "id": "rec1",
      "category": "irrigation|fertilizer|pest_control|disease_control|harvest|general",
      "action": "Specific action to take",
      "reason": "Why this is needed now based on crop stage and conditions",
      "priority": "high|medium|low",
      "timing": "When to do it (e.g., 'Within 2-3 days', 'Next irrigation')",
      "products": [
        {
          "name": "Product name",
          "manufacturer": "Company name",
          "dosage": "Amount and application method"
        }
      ]
    }
  ]
}`;

  // Try multiple models
  const models = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
  ];

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.recommendations || [];
      }
    }

    if (response.status !== 404) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
  }

  throw new Error("All Gemini models failed");
}

async function getProductBasedRecommendations(
  cropType: string,
  stage: string,
  healthScore: number,
  weather: { temperature: number; rainfall7d: number },
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Query actual products from database
  try {
    const products = await query<{
      id: string;
      name: string;
      category: string;
      manufacturer: string;
      dosage: string;
    }>(
      `SELECT id, name, category, manufacturer, dosage 
       FROM agri_products 
       WHERE is_active = true AND ($1 = ANY(recommended_for) OR recommended_for IS NULL)
       ORDER BY category, name LIMIT 10`,
      [cropType],
    );

    // Build recommendations based on stage and health
    if (stage === "vegetative" || stage === "seedling") {
      const fertilizer = products.find((p) => p.category === "fertilizer");
      if (fertilizer) {
        recommendations.push({
          id: "fert1",
          category: "fertilizer",
          action: `Apply ${fertilizer.name} for vegetative growth`,
          reason: `${stage} stage requires nitrogen for leaf development`,
          priority: "high",
          timing: "Within next irrigation cycle",
          products: [{
            name: fertilizer.name,
            manufacturer: fertilizer.manufacturer,
            dosage: fertilizer.dosage || "As per label",
          }],
        });
      }
    }

    if (weather.rainfall7d > 50) {
      const fungicide = products.find((p) => p.category === "fungicide");
      if (fungicide) {
        recommendations.push({
          id: "fung1",
          category: "disease_control",
          action: `Apply ${fungicide.name} as preventive spray`,
          reason: "High rainfall increases fungal disease risk",
          priority: "high",
          timing: "After rain stops, within 24-48 hours",
          products: [{
            name: fungicide.name,
            manufacturer: fungicide.manufacturer,
            dosage: fungicide.dosage || "As per label",
          }],
        });
      }
    }

    if (healthScore < 60) {
      recommendations.push({
        id: "health1",
        category: "general",
        action: "Scout field for stress symptoms",
        reason:
          `Health score (${healthScore}) below optimal. Identify specific stress cause.`,
        priority: "high",
        timing: "Immediately, preferably morning hours",
      });
    }
  } catch {
    // Fallback minimal recommendations
    recommendations.push({
      id: "gen1",
      category: "general",
      action: "Monitor crop regularly and maintain field hygiene",
      reason: `${cropType} at ${stage} stage needs regular monitoring`,
      priority: "medium",
      timing: "Ongoing",
    });
  }

  return recommendations;
}
