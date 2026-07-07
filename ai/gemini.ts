/**
 * Google Gemini AI Integration for Advanced Farm Analysis
 * Provides detailed crop health analysis, pest identification, and recommendations
 *
 * Calls Gemini via Vertex AI (not the Google AI Studio API), authenticated
 * with the runtime's own GCP identity -- no API key to configure or rotate.
 * Billing runs through the normal Cloud Billing account instead of AI
 * Studio's separate prepaid-credit system.
 */

import { env } from "$utils/env.ts";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * An access token for the current GCP identity. On Cloud Run/Compute Engine
 * this comes from the metadata server (the attached service account); for
 * local development it falls back to `gcloud auth application-default
 * print-access-token` (run `gcloud auth application-default login` once).
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const isDeployed = !!Deno.env.get("K_SERVICE") ||
    !!Deno.env.get("DENO_DEPLOYMENT_ID");

  if (isDeployed) {
    const response = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to get access token from metadata server: ${response.status}`,
      );
    }
    const data = await response.json();
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };
    return cachedToken.value;
  }

  const command = new Deno.Command("gcloud", {
    args: ["auth", "application-default", "print-access-token"],
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  if (!success) {
    throw new Error(
      `Failed to get local access token (run "gcloud auth application-default login"): ${
        new TextDecoder().decode(stderr)
      }`,
    );
  }
  const token = new TextDecoder().decode(stdout).trim();
  cachedToken = { value: token, expiresAt: Date.now() + 25 * 60 * 1000 };
  return token;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

interface FarmAnalysisInput {
  farmName: string;
  cropType: string;
  cropStage: string;
  sowingDate: string;
  location: { lat: number; lon: number; district: string; state: string };
  weather: {
    temperature: number;
    humidity: number;
    rainfall7d: number;
    forecast: string;
  };
  health: {
    ndvi: number;
    evi: number;
    healthScore: number;
    stressIndicators: string[];
  };
  soilType?: string;
  irrigationType?: string;
}

interface FarmAnalysisResult {
  summary: string;
  healthAssessment: string;
  risks: Array<{ type: string; severity: string; description: string }>;
  recommendations: Array<{
    category: string;
    action: string;
    priority: "high" | "medium" | "low";
    timing: string;
  }>;
  yieldPrediction?: string;
  marketAdvice?: string;
}

// Valid Gemini models (in order of preference) - Updated Feb 2026
const VALID_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

class GeminiClient {
  private projectId: string;
  private location: string;

  constructor() {
    this.projectId = env.GOOGLE_CLOUD_PROJECT;
    this.location = env.VERTEX_AI_LOCATION;
  }

  private endpointHost(): string {
    // The "global" location is reached via the global (non-region-prefixed)
    // aiplatform host; regional locations use a region-prefixed host.
    return this.location === "global"
      ? "aiplatform.googleapis.com"
      : `${this.location}-aiplatform.googleapis.com`;
  }

  /**
   * Core request: tries each model (falling through on 404) until one
   * succeeds, authenticated as the runtime's own GCP identity.
   */
  private async request(
    parts: Array<Record<string, unknown>>,
    generationConfig: Record<string, unknown>,
  ): Promise<string> {
    const token = await getAccessToken();

    let lastError: Error | null = null;
    for (const model of VALID_MODELS) {
      const url =
        `https://${this.endpointHost()}/v1/projects/${this.projectId}` +
        `/locations/${this.location}/publishers/google/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
      });

      if (response.ok) {
        const data: GeminiResponse = await response.json();
        return data.candidates[0]?.content?.parts[0]?.text || "";
      }

      const body = await response.text().catch(() => "");
      lastError = new Error(
        `Vertex AI Gemini error: ${response.status} - ${body.slice(0, 300)}`,
      );

      if (response.status === 404) continue; // model not on this location
      throw lastError;
    }

    throw lastError ?? new Error("All Gemini models failed.");
  }

  private generateContent(prompt: string): Promise<string> {
    return this.request([{ text: prompt }], {
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
  }

  /**
   * Analyze farm health and provide detailed recommendations
   */
  async analyzeFarmHealth(
    input: FarmAnalysisInput,
  ): Promise<FarmAnalysisResult> {
    const prompt =
      `You are an expert agricultural advisor for Indian farming. Analyze this farm data and provide actionable recommendations.

FARM DATA:
- Farm: ${input.farmName}
- Crop: ${input.cropType} (Stage: ${input.cropStage})
- Sowing Date: ${input.sowingDate}
- Location: ${input.location.district}, ${input.location.state}
- Coordinates: ${input.location.lat.toFixed(4)}, ${
        input.location.lon.toFixed(4)
      }
- Soil Type: ${input.soilType || "Unknown"}
- Irrigation: ${input.irrigationType || "Unknown"}

WEATHER CONDITIONS:
- Temperature: ${input.weather.temperature}°C
- Humidity: ${input.weather.humidity}%
- Rainfall (last 7 days): ${input.weather.rainfall7d}mm
- Forecast: ${input.weather.forecast}

SATELLITE HEALTH INDICATORS:
- NDVI: ${input.health.ndvi.toFixed(3)} (0-1 scale, >0.6 is healthy)
- EVI: ${input.health.evi.toFixed(3)}
- Health Score: ${input.health.healthScore}/100
- Stress Indicators: ${
        input.health.stressIndicators.join(", ") || "None detected"
      }

Respond in this JSON format only:
{
  "summary": "2-3 sentence overall assessment",
  "healthAssessment": "Detailed health analysis based on NDVI and weather",
  "risks": [
    {"type": "pest|disease|weather|nutrient", "severity": "high|medium|low", "description": "specific risk"}
  ],
  "recommendations": [
    {"category": "irrigation|fertilizer|pest_control|harvest", "action": "specific action", "priority": "high|medium|low", "timing": "when to do it"}
  ],
  "yieldPrediction": "Expected yield assessment",
  "marketAdvice": "When to sell and price expectations"
}`;

    const response = await this.generateContent(prompt);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FarmAnalysisResult;
      }
    } catch {
      // If JSON parsing fails, return structured fallback
    }

    return {
      summary: response.slice(0, 500),
      healthAssessment: "Unable to parse detailed assessment",
      risks: [],
      recommendations: [],
    };
  }

  /**
   * Get pest/disease identification from symptoms
   */
  async identifyPestOrDisease(params: {
    cropType: string;
    symptoms: string[];
    images?: string[];
  }): Promise<{
    possibleCauses: Array<{
      name: string;
      confidence: number;
      description: string;
    }>;
    treatment: string;
    prevention: string;
  }> {
    const prompt =
      `You are an expert plant pathologist. Identify possible pests or diseases.

CROP: ${params.cropType}
SYMPTOMS OBSERVED:
${params.symptoms.map((s) => `- ${s}`).join("\n")}

Respond in JSON format:
{
  "possibleCauses": [
    {"name": "pest/disease name", "confidence": 0.0-1.0, "description": "brief description"}
  ],
  "treatment": "Recommended treatment in Indian context",
  "prevention": "Prevention measures for future"
}`;

    const response = await this.generateContent(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // fallback
    }

    return {
      possibleCauses: [],
      treatment: "Please consult a local agricultural expert",
      prevention: response.slice(0, 500),
    };
  }

  /**
   * Generate localized advisory content
   */
  async generateAdvisory(params: {
    alertType: string;
    cropType: string;
    severity: string;
    language: string;
    context: Record<string, unknown>;
  }): Promise<{ title: string; message: string; actions: string[] }> {
    const langNames: Record<string, string> = {
      en: "English",
      hi: "Hindi",
      mr: "Marathi",
      ta: "Tamil",
      te: "Telugu",
      kn: "Kannada",
      gu: "Gujarati",
    };

    const prompt = `Generate a farmer advisory in ${
      langNames[params.language] || "English"
    }.

ALERT TYPE: ${params.alertType}
CROP: ${params.cropType}
SEVERITY: ${params.severity}
CONTEXT: ${JSON.stringify(params.context)}

Respond in JSON (with text in ${langNames[params.language] || "English"}):
{
  "title": "Alert title",
  "message": "Detailed message for farmer (2-3 sentences)",
  "actions": ["Action 1", "Action 2", "Action 3"]
}`;

    const response = await this.generateContent(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // fallback
    }

    return {
      title: `${params.alertType} Alert`,
      message: response.slice(0, 300),
      actions: [],
    };
  }

  /**
   * Generate content with image input for crop analysis
   */
  generateWithImage(prompt: string, imageBase64: string): Promise<string> {
    return this.request(
      [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
      { temperature: 0.4, maxOutputTokens: 2048 },
    );
  }

  /**
   * Plain text generation (public wrapper over generateContent)
   */
  generate(prompt: string): Promise<string> {
    return this.generateContent(prompt);
  }

  /**
   * Generate content with audio input (voice notes — Gemini is multimodal,
   * so this doubles as speech understanding for languages Cloud STT v1
   * doesn't cover, e.g. Odia)
   */
  generateWithAudio(
    prompt: string,
    audioBase64: string,
    mimeType: string,
  ): Promise<string> {
    return this.request(
      [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: audioBase64 } },
      ],
      { temperature: 0.3, maxOutputTokens: 2048 },
    );
  }

  /**
   * Check if Gemini (via Vertex AI) is configured
   */
  isAvailable(): boolean {
    return !!this.projectId;
  }
}

// Singleton instance
let geminiClient: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!geminiClient) {
    geminiClient = new GeminiClient();
  }
  return geminiClient;
}

// Export singleton for convenience
export const gemini = getGeminiClient();

export type { FarmAnalysisInput, FarmAnalysisResult };
