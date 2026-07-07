import { Handlers } from "$fresh/server.ts";
import { llmGenerateWithImage } from "$ai/llm.ts";
import { queryOne } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  async POST(req, ctx) {
    if (!ctx.state.session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { image: rawImage, farmId, cropType } = await req.json();

      if (!rawImage) {
        return Response.json({ error: "Image is required" }, { status: 400 });
      }

      // The client sends a full data URL (canvas.toDataURL /
      // FileReader.readAsDataURL); Gemini's inline_data.data wants raw
      // base64 only, no "data:image/jpeg;base64," prefix.
      const image = rawImage.replace(/^data:[^;]+;base64,/, "");

      // Use Gemini to analyze the crop image
      const prompt = `Analyze this crop/plant image and provide:
1. Identify the crop/plant type
2. Assess overall health (0-100 score)
3. Detect any diseases, pests, or nutrient deficiencies
4. Provide actionable recommendations

Respond in this exact JSON format:
{
  "healthScore": <number 0-100>,
  "cropIdentified": "<crop name>",
  "confidence": <number 0-1>,
  "issues": [
    {
      "type": "<disease|pest|nutrient|water|other>",
      "severity": "<low|medium|high>",
      "description": "<brief description>"
    }
  ],
  "recommendations": [
    "<actionable recommendation 1>",
    "<actionable recommendation 2>"
  ]
}

If you cannot identify issues, return empty arrays for issues and recommendations.
Be practical and specific for Indian farming conditions.`;

      const { session } = ctx.state;
      const response = await llmGenerateWithImage(
        session.tenantId,
        prompt,
        image,
      );

      // Parse the JSON from response
      let result;
      try {
        // Extract JSON from response (might be wrapped in markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch {
        // Fallback response if parsing fails
        result = {
          healthScore: 70,
          cropIdentified: "Unknown",
          confidence: 0.5,
          issues: [],
          recommendations: [
            "Take a clearer photo for better analysis",
            "Ensure good lighting when capturing crop images",
          ],
        };
      }

      let scanId: string | null = null;
      try {
        const row = await queryOne<{ id: string }>(
          `INSERT INTO crop_scans
             (tenant_id, farmer_id, farm_id, crop_type, image_data,
              health_score, crop_identified, confidence, issues, recommendations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            session.tenantId,
            session.userId,
            farmId || null,
            cropType || null,
            rawImage,
            result.healthScore ?? null,
            result.cropIdentified ?? null,
            result.confidence ?? null,
            JSON.stringify(result.issues ?? []),
            JSON.stringify(result.recommendations ?? []),
          ],
        );
        scanId = row?.id ?? null;
      } catch (dbError) {
        // Show the analysis to the user even if we fail to persist it.
        console.error("Failed to save crop scan:", dbError);
      }

      return Response.json({ data: { ...result, scanId } });
    } catch (error) {
      console.error("Crop analysis error:", error);
      return Response.json(
        { error: "Failed to analyze image" },
        { status: 500 },
      );
    }
  },
};
