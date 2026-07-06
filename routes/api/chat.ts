import { Handlers } from "$fresh/server.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import { llmGenerate } from "$ai/llm.ts";

interface ChatRequest {
  message: string;
  context: {
    location: string;
    activeCrop: string | null;
    cropStage: string | null;
    season: string;
  };
}

export const handler: Handlers<unknown, AuthState> = {
  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const message = body.message;
    const context = body.context || {
      location: "India",
      activeCrop: null,
      cropStage: null,
      season: new Date().getMonth() >= 5 && new Date().getMonth() <= 9
        ? "kharif"
        : "rabi",
    };

    if (!message || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Configured provider (admin → AI Provider), falling back to Gemini
    try {
      const response = await generateAIResponse(
        ctx.state.session.tenantId,
        message,
        context,
      );
      return new Response(
        JSON.stringify({ response }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("LLM error:", error);
      // Fall back to rule-based response
    }

    // Rule-based fallback response
    const response = generateFallbackResponse(message, context);
    return new Response(
      JSON.stringify({ response }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
};

interface ChatContext {
  farmName?: string | null;
  location: string;
  activeCrop: string | null;
  cropStage: string | null;
  healthScore?: number | null;
  daysAfterSowing?: number | null;
  season: string;
}

async function generateAIResponse(
  tenantId: string,
  message: string,
  context: ChatContext,
): Promise<string> {
  const farmInfo = context.farmName ? `Farm: ${context.farmName}` : "";
  const healthInfo = context.healthScore
    ? `Health Score: ${context.healthScore}%`
    : "";
  const daysInfo = context.daysAfterSowing
    ? `Days after sowing: ${context.daysAfterSowing}`
    : "";

  const systemPrompt =
    `You are an expert agricultural advisor for Indian farmers. You must:
- Give practical, actionable advice in simple language
- Consider the farmer's specific context: location, crop, growth stage, and season
- Structure responses with: Problem summary, Likely cause, Recommended action, Preventive steps
- Be region-aware and use locally available solutions
- Never recommend harmful chemicals without safety warnings
- If unsure, recommend consulting a local Krishi Vigyan Kendra (KVK)

FARMER CONTEXT:
${farmInfo}
- Location: ${context.location}
- Current Crop: ${context.activeCrop || "Not specified"}
- Growth Stage: ${context.cropStage || "Unknown"}
${daysInfo}
${healthInfo}
- Season: ${context.season}

Respond in a friendly, helpful manner. Keep responses concise but complete.`;

  const response = await llmGenerate(
    tenantId,
    systemPrompt + "\n\nFarmer's question: " + message,
    { temperature: 0.7, maxTokens: 1024 },
  );
  return response || "Sorry, I couldn't generate a response.";
}

function generateFallbackResponse(
  message: string,
  context: {
    location: string;
    activeCrop: string | null;
    cropStage: string | null;
    season: string;
  },
): string {
  const lowerMessage = message.toLowerCase();
  const crop = context.activeCrop || "your crop";
  const stage = context.cropStage || "current";

  // Yellow leaves
  if (lowerMessage.includes("yellow") && lowerMessage.includes("leav")) {
    return `**Yellow Leaves Analysis for ${crop}**

**Likely Causes:**
1. Nitrogen deficiency (most common)
2. Iron deficiency (if young leaves affected)
3. Overwatering or poor drainage
4. Natural aging (if only lower leaves)

**Recommended Actions:**
• Apply urea at 20-25 kg/acre as foliar spray (2% solution)
• For iron deficiency: Apply ferrous sulfate 0.5% spray
• Check soil drainage and reduce irrigation if waterlogged

**Preventive Steps:**
• Maintain balanced NPK fertilization
• Ensure proper drainage in field
• Regular soil testing every season

**Caution:** If yellowing spreads rapidly with spots, it may indicate a disease. Consult your local KVK for diagnosis.`;
  }

  // Irrigation
  if (lowerMessage.includes("irrigat") || lowerMessage.includes("water")) {
    const stageAdvice: Record<string, string> = {
      Germination: "Light irrigation every 3-4 days to keep soil moist",
      Seedling: "Irrigate every 5-7 days depending on soil type",
      Vegetative: "Critical stage - irrigate every 7-10 days",
      Flowering:
        "Most critical - maintain adequate moisture, irrigate every 5-7 days",
      "Pod Formation": "Regular irrigation every 7-10 days",
      Maturity: "Reduce irrigation, stop 10-15 days before harvest",
    };

    return `**Irrigation Guidance for ${crop} (${stage} Stage)**

**Current Recommendation:**
${
      stageAdvice[stage] ||
      "Irrigate based on soil moisture - check 2-3 inches deep"
    }

**Best Practices:**
• Irrigate early morning or late evening
• Avoid waterlogging - ensure proper drainage
• Use drip irrigation if available (saves 30-40% water)
• Check soil moisture by hand before irrigating

**Weather Consideration:**
For ${context.location}, check the 3-day forecast before irrigating. Skip if rain is expected.

**Signs of Water Stress:**
• Leaves wilting in afternoon
• Soil cracking
• Stunted growth`;
  }

  // Fertilizer
  if (
    lowerMessage.includes("fertiliz") || lowerMessage.includes("nutrient") ||
    lowerMessage.includes("urea")
  ) {
    return `**Fertilizer Recommendation for ${crop} (${stage} Stage)**

**Timing is Important:**
• Basal dose: At sowing
• First top dressing: 25-30 days after sowing
• Second top dressing: 45-50 days after sowing

**General NPK Schedule:**
• Nitrogen (N): Split application - 50% basal, 25% at 30 days, 25% at 45 days
• Phosphorus (P): Full dose at sowing
• Potash (K): 50% basal, 50% at flowering

**Application Method:**
• Apply when soil is moist
• Avoid direct contact with plant stem
• Incorporate into soil if possible

**Caution:**
• Don't over-apply nitrogen - causes lodging
• Avoid fertilizer application before heavy rain
• Store fertilizers in dry place`;
  }

  // Pest
  if (
    lowerMessage.includes("pest") || lowerMessage.includes("insect") ||
    lowerMessage.includes("bug")
  ) {
    return `**Pest Management Advisory**

**Integrated Pest Management (IPM) Approach:**

**1. Cultural Control:**
• Remove and destroy infected plant parts
• Maintain field hygiene
• Use trap crops around main field

**2. Biological Control:**
• Install pheromone traps (3-5 per acre)
• Release Trichogramma cards for borer control
• Encourage natural predators

**3. Mechanical Control:**
• Hand-picking of large insects
• Yellow sticky traps for whiteflies
• Light traps for nocturnal pests

**4. Chemical Control (Last Resort):**
• Neem oil spray (2%) - safe for environment
• Consult local dealer for specific pesticide
• Always follow label instructions

**Safety Precautions:**
• Wear protective gear when spraying
• Don't spray during flowering (harmful to pollinators)
• Maintain waiting period before harvest`;
  }

  // Weekly advice
  if (
    lowerMessage.includes("week") || lowerMessage.includes("advice") ||
    lowerMessage.includes("today")
  ) {
    return `**Weekly Advisory for ${crop} in ${context.location}**

**This Week's Priority Tasks:**

1. **Field Monitoring**
   • Scout field early morning for pest/disease signs
   • Check soil moisture at 2-3 inch depth
   • Note any nutrient deficiency symptoms

2. **Irrigation Schedule**
   • Based on ${stage} stage: Monitor every 2-3 days
   • Check weather forecast before irrigating

3. **Nutrient Management**
   • If plants show pale green color, consider nitrogen top-up
   • Micronutrient spray if deficiency symptoms visible

4. **Pest Watch**
   • Common pests this season: Monitor regularly
   • Install yellow sticky traps for early detection

5. **Weather Alert**
   • ${context.season} season - be prepared for seasonal weather patterns
   • Keep drainage channels clear

**Coming Up Next Week:**
• Plan for next growth stage requirements
• Prepare inputs in advance`;
  }

  // Default response
  return `Thank you for your question about "${message}".

**General Guidance:**
Based on your ${crop} at ${stage} stage in ${context.location}:

1. **Regular Monitoring:** Check your field daily for any changes
2. **Soil Health:** Ensure proper drainage and moisture levels
3. **Balanced Nutrition:** Follow recommended fertilizer schedule
4. **Pest Vigilance:** Early detection helps prevent major damage

**For Specific Advice:**
• Share more details about the problem you're facing
• Mention any visible symptoms
• Take photos if possible and use our Field Analysis feature

**Expert Help:**
For complex issues, visit your nearest:
• Krishi Vigyan Kendra (KVK)
• Agricultural Extension Office
• State Agriculture University

I'm here to help! Ask me about specific problems and I'll provide detailed guidance.`;
}
