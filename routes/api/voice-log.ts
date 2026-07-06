import { Handlers } from "$fresh/server.ts";
import { gemini } from "../../ai/gemini.ts";
import { llmGenerate } from "$ai/llm.ts";
import { transcribeAudio } from "$lib/stt.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface VoiceAnalysis {
  category: "pest" | "disease" | "nutrient" | "irrigation" | "general";
  severity: "low" | "medium" | "high";
  summary: string;
  cropMentioned: string | null;
  recommendations: string[];
}

const FALLBACK_ANALYSIS: VoiceAnalysis = {
  category: "general",
  severity: "medium",
  summary: "Voice report logged. AI analysis unavailable — review manually.",
  cropMentioned: null,
  recommendations: [
    "Report has been saved with the transcript",
    "Raise an expert ticket for a specialist to review",
  ],
};

async function analyzeTranscript(
  tenantId: string,
  transcript: string,
  cropType?: string,
): Promise<VoiceAnalysis> {
  if (!gemini.isAvailable()) return FALLBACK_ANALYSIS;

  const prompt =
    `An Indian farmer left this voice note about their crop's health` +
    (cropType ? ` (declared crop: ${cropType})` : "") +
    `:\n\n"${transcript}"\n\n` +
    `Analyze it and respond with ONLY this JSON, nothing else:\n` +
    `{
  "category": "<pest|disease|nutrient|irrigation|general>",
  "severity": "<low|medium|high>",
  "summary": "<one-sentence English summary of the problem>",
  "cropMentioned": "<crop name mentioned, or null>",
  "recommendations": ["<practical action 1>", "<practical action 2>"]
}\n` +
    `Be practical and specific for Indian farming conditions.`;

  try {
    const raw = await llmGenerate(tenantId, prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return FALLBACK_ANALYSIS;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category ?? "general",
      severity: parsed.severity ?? "medium",
      summary: parsed.summary ?? transcript.slice(0, 120),
      cropMentioned: parsed.cropMentioned ?? null,
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
    };
  } catch {
    return FALLBACK_ANALYSIS;
  }
}

export const handler: Handlers<unknown, AuthState> = {
  async POST(req, ctx) {
    if (!ctx.state.session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      audio?: string;
      mimeType?: string;
      language?: string;
      cropType?: string;
    };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.audio) {
      return Response.json({ error: "audio (base64) is required" }, {
        status: 400,
      });
    }
    // ~10MB base64 cap — voice notes should be short
    if (body.audio.length > 14_000_000) {
      return Response.json({ error: "Audio too large (max ~10MB)" }, {
        status: 413,
      });
    }

    const transcription = await transcribeAudio({
      audioBase64: body.audio,
      mimeType: body.mimeType || "audio/webm",
      languageCode: body.language,
    });

    const analysis = await analyzeTranscript(
      ctx.state.session.tenantId,
      transcription.transcript,
      body.cropType,
    );

    return Response.json({
      transcript: transcription.transcript,
      language: transcription.language,
      sttProvider: transcription.provider,
      confidence: transcription.confidence,
      analysis,
      generatedAt: new Date().toISOString(),
    });
  },
};
