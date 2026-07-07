/**
 * Speech-to-Text for voice crop-health logging.
 *
 * Provider chain (each step degrades to the next, and the provider used is
 * always labeled in the result — never silent):
 * 1. Google Cloud Speech-to-Text (event-recommended tool), IAM-authenticated
 *    like Vertex AI, when the audio encoding is supported
 * 2. Gemini multimodal audio (via Vertex AI) — also covers languages
 *    Cloud STT v1 lacks (e.g. Odia) and non-Opus containers (Safari mp4)
 * 3. Labeled mock so the demo flow works offline
 */

import { gemini } from "../ai/gemini.ts";
import { getAccessToken } from "$lib/gcp-auth.ts";
import { env } from "$utils/env.ts";

export interface TranscriptionResult {
  transcript: string;
  /** BCP-47 language detected/used, e.g. "hi-IN", "or-IN", "en-IN" */
  language: string;
  provider: "google-cloud-stt" | "gemini-audio" | "mock";
  confidence: number | null;
}

const STT_URL = "https://speech.googleapis.com/v1/speech:recognize";

/** Cloud STT v1 encodings by MIME type (browser MediaRecorder output) */
function sttEncodingFor(mimeType: string): string | null {
  if (mimeType.includes("webm")) return "WEBM_OPUS";
  if (mimeType.includes("ogg")) return "OGG_OPUS";
  if (mimeType.includes("wav")) return "LINEAR16";
  return null; // mp4/aac (Safari) → not supported by v1, use Gemini
}

async function transcribeWithCloudStt(params: {
  audioBase64: string;
  mimeType: string;
  languageCode: string;
}): Promise<TranscriptionResult | null> {
  const encoding = sttEncodingFor(params.mimeType);
  if (!encoding) return null;

  const token = await getAccessToken();
  const response = await fetch(STT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-goog-user-project": env.GOOGLE_CLOUD_PROJECT,
    },
    body: JSON.stringify({
      config: {
        encoding,
        languageCode: params.languageCode,
        alternativeLanguageCodes: ["hi-IN", "en-IN"].filter(
          (l) => l !== params.languageCode,
        ),
        enableAutomaticPunctuation: true,
      },
      audio: { content: params.audioBase64 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Cloud STT failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const alt = data.results?.[0]?.alternatives?.[0];
  if (!alt?.transcript) return null;

  return {
    transcript: alt.transcript,
    language: data.results?.[0]?.languageCode || params.languageCode,
    provider: "google-cloud-stt",
    confidence: alt.confidence ?? null,
  };
}

async function transcribeWithGemini(params: {
  audioBase64: string;
  mimeType: string;
  languageCode: string;
}): Promise<TranscriptionResult | null> {
  if (!gemini.isAvailable()) return null;

  const prompt =
    `Transcribe this audio exactly as spoken. The speaker is an Indian farmer ` +
    `and may speak Odia, Hindi, English, or a mix. Likely language: ${params.languageCode}.\n` +
    `Respond with ONLY this JSON, nothing else:\n` +
    `{"transcript": "<verbatim transcription in original script>", "language": "<BCP-47 code like or-IN>"}`;

  const raw = await gemini.generateWithAudio(
    prompt,
    params.audioBase64,
    params.mimeType,
  );
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.transcript) return null;
    return {
      transcript: parsed.transcript,
      language: parsed.language || params.languageCode,
      provider: "gemini-audio",
      confidence: null,
    };
  } catch {
    return null;
  }
}

/**
 * Transcribe a farmer's voice note. Never throws — degrades down the
 * provider chain and finally returns a labeled mock.
 */
export async function transcribeAudio(params: {
  audioBase64: string;
  mimeType: string;
  /** Preferred language, defaults to Hindi */
  languageCode?: string;
}): Promise<TranscriptionResult> {
  const languageCode = params.languageCode || "hi-IN";
  const { audioBase64, mimeType } = params;

  try {
    const result = await transcribeWithCloudStt({
      audioBase64,
      mimeType,
      languageCode,
    });
    if (result) return result;
  } catch (e) {
    console.error("[STT] Cloud STT failed, falling back to Gemini:", e);
  }

  try {
    const result = await transcribeWithGemini({
      audioBase64,
      mimeType,
      languageCode,
    });
    if (result) return result;
  } catch (e) {
    console.error("[STT] Gemini audio failed, falling back to mock:", e);
  }

  return {
    transcript:
      "[MOCK TRANSCRIPT] My paddy leaves have yellow-brown spots since last week " +
      "and some plants are wilting near the field edge.",
    language: languageCode,
    provider: "mock",
    confidence: null,
  };
}
