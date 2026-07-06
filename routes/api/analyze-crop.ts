import { Handlers } from "$fresh/server.ts";
import { llmGenerateWithImage } from "$ai/llm.ts";
import type { AuthState } from "../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  async POST(req, ctx) {
    try {
      const { image, farmId: _farmId } = await req.json();

      if (!image) {
        return Response.json({ error: "Image is required" }, { status: 400 });
      }

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

      const response = await llmGenerateWithImage(
        ctx.state.session?.tenantId || "default",
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

      return Response.json({ data: result });
    } catch (error) {
      console.error("Crop analysis error:", error);
      return Response.json(
        { error: "Failed to analyze image" },
        { status: 500 },
      );
    }
  },
};
