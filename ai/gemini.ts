/**
 * Google Gemini AI Integration for Advanced Farm Analysis
 * Provides detailed crop health analysis, pest identification, and recommendations
 */

import { env } from "$utils/env.ts";

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
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.GEMINI_API_KEY || "";
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  }

  /** Primary key plus optional rotation keys (GEMINI_API_KEY_ALT) */
  private apiKeys(): string[] {
    return [this.apiKey, Deno.env.get("GEMINI_API_KEY_ALT") || ""]
      .filter(Boolean);
  }

  /**
   * Core request: tries each API key (rotating on 429 quota exhaustion)
   * and each model (falling through on 404) until one succeeds.
   */
  private async request(
    parts: Array<Record<string, unknown>>,
    generationConfig: Record<string, unknown>,
  ): Promise<string> {
    const keys = this.apiKeys();
    if (keys.length === 0) {
      throw new Error("Gemini API key not configured");
    }

    let lastError: Error | null = null;
    for (const key of keys) {
      for (const model of VALID_MODELS) {
        const url =
          `${this.baseUrl}/models/${model}:generateContent?key=${key}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          `Gemini API error: ${response.status} - ${body.slice(0, 300)}`,
        );

        if (response.status === 404) continue; // model not on this key
        if (response.status === 429) break; // quota — rotate to next key
        throw lastError;
      }
    }

    throw lastError ??
      new Error("All Gemini models failed. Check your API key.");
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
   * Check if Gemini is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
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
