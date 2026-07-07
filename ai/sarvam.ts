import { env } from "$utils/env.ts";
import { execute, queryOne } from "$db/client.ts";

// Sarvam AI Provider Interface
export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  cached: boolean;
}

export interface TTSResult {
  audioUrl: string;
  language: string;
  cached: boolean;
}

// Hash function for caching
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Language code mapping for Sarvam AI
const SARVAM_LANGUAGE_CODES: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  bn: "bn-IN",
  or: "or-IN",
};

// Voice IDs for Sarvam TTS
const SARVAM_VOICES: Record<string, string> = {
  "hi-IN": "meera",
  "en-IN": "arvind",
  "mr-IN": "meera",
  "ta-IN": "meera",
  "te-IN": "meera",
  "kn-IN": "meera",
  "gu-IN": "meera",
  "bn-IN": "meera",
  "ml-IN": "meera",
  "pa-IN": "meera",
  "or-IN": "meera",
};

class SarvamAIClient {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = env.SARVAM_API_KEY;
    this.apiUrl = env.SARVAM_API_URL;
  }

  private async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Sarvam AI API key not configured");
    }

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Subscription-Key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sarvam AI API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationResult> {
    // Check cache first
    const textHash = await hashText(text);
    const cached = await queryOne<{ translated_text: string }>(
      `SELECT translated_text FROM translation_cache
       WHERE source_text_hash = $1 AND source_language = $2 AND target_language = $3`,
      [textHash, sourceLanguage, targetLanguage],
    );

    if (cached) {
      return {
        translatedText: cached.translated_text,
        sourceLanguage,
        targetLanguage,
        cached: true,
      };
    }

    // If same language, return as-is
    if (sourceLanguage === targetLanguage) {
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        cached: false,
      };
    }

    // Mock mode for development
    if (!this.apiKey || env.IS_DEV) {
      const mockTranslation = `[${targetLanguage}] ${text}`;
      await this.cacheTranslation(
        textHash,
        sourceLanguage,
        targetLanguage,
        mockTranslation,
      );
      return {
        translatedText: mockTranslation,
        sourceLanguage,
        targetLanguage,
        cached: false,
      };
    }

    // Call Sarvam AI Translation API
    const sourceLang = SARVAM_LANGUAGE_CODES[sourceLanguage] || "en-IN";
    const targetLang = SARVAM_LANGUAGE_CODES[targetLanguage] || "hi-IN";

    const result = await this.makeRequest<{ translated_text: string }>(
      "/translate",
      {
        input: text,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        speaker_gender: "Female",
        mode: "formal",
        model: "mayura:v1",
        enable_preprocessing: true,
      },
    );

    // Cache the result
    await this.cacheTranslation(
      textHash,
      sourceLanguage,
      targetLanguage,
      result.translated_text,
    );

    return {
      translatedText: result.translated_text,
      sourceLanguage,
      targetLanguage,
      cached: false,
    };
  }

  private async cacheTranslation(
    textHash: string,
    sourceLanguage: string,
    targetLanguage: string,
    translatedText: string,
  ): Promise<void> {
    await execute(
      `INSERT INTO translation_cache (source_text_hash, source_language, target_language, translated_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_text_hash, source_language, target_language) DO UPDATE SET
         translated_text = EXCLUDED.translated_text`,
      [textHash, sourceLanguage, targetLanguage, translatedText],
    );
  }

  async textToSpeech(
    text: string,
    language: string,
    voiceId?: string,
  ): Promise<TTSResult> {
    // Check cache first
    const textHash = await hashText(text);
    const voice = voiceId || SARVAM_VOICES[SARVAM_LANGUAGE_CODES[language]] ||
      "meera";

    const cached = await queryOne<{ audio_url: string }>(
      `SELECT audio_url FROM tts_cache
       WHERE text_hash = $1 AND language = $2 AND voice_id = $3`,
      [textHash, language, voice],
    );

    if (cached) {
      return {
        audioUrl: cached.audio_url,
        language,
        cached: true,
      };
    }

    // Mock mode for development
    if (!this.apiKey || env.IS_DEV) {
      const mockAudioUrl = `https://storage.khetscope.app/audio/mock_${
        textHash.slice(0, 8)
      }.mp3`;
      await this.cacheTTS(textHash, language, voice, mockAudioUrl);
      return {
        audioUrl: mockAudioUrl,
        language,
        cached: false,
      };
    }

    // Call Sarvam AI TTS API
    const langCode = SARVAM_LANGUAGE_CODES[language] || "hi-IN";

    const result = await this.makeRequest<{ audios: string[] }>(
      "/text-to-speech",
      {
        inputs: [text],
        target_language_code: langCode,
        speaker: voice,
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 22050,
        enable_preprocessing: true,
        model: "bulbul:v1",
      },
    );

    // In production, upload the audio to S3 and return the URL
    // For now, we'll use the base64 audio data URL
    const audioDataUrl = `data:audio/mp3;base64,${result.audios[0]}`;

    // TODO: Upload to S3 and get permanent URL
    const audioUrl = audioDataUrl;

    // Cache the result
    await this.cacheTTS(textHash, language, voice, audioUrl);

    return {
      audioUrl,
      language,
      cached: false,
    };
  }

  private async cacheTTS(
    textHash: string,
    language: string,
    voiceId: string,
    audioUrl: string,
  ): Promise<void> {
    await execute(
      `INSERT INTO tts_cache (text_hash, language, voice_id, audio_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (text_hash, language, voice_id) DO UPDATE SET
         audio_url = EXCLUDED.audio_url`,
      [textHash, language, voiceId, audioUrl],
    );
  }

  async summarizeAdvisory(
    structuredAdvisory: {
      type: string;
      severity: string;
      title: string;
      description: string;
      actions?: { label: string; type: string; value: string }[];
    },
    language: string,
  ): Promise<{ summary: string; audioUrl?: string }> {
    // Create a concise summary suitable for voice
    const actionsList = structuredAdvisory.actions
      ?.map((a) => a.label)
      .join(", ") || "";

    const summaryTemplate =
      `${structuredAdvisory.title}. ${structuredAdvisory.description}${
        actionsList ? ` Recommended actions: ${actionsList}.` : ""
      }`;

    // Translate if needed
    let summary = summaryTemplate;
    if (language !== "en") {
      const translation = await this.translate(summaryTemplate, "en", language);
      summary = translation.translatedText;
    }

    // Generate TTS if voice alerts enabled
    let audioUrl: string | undefined;
    if (env.ENABLE_VOICE_ALERTS) {
      const tts = await this.textToSpeech(summary, language);
      audioUrl = tts.audioUrl;
    }

    return { summary, audioUrl };
  }
}

// Export singleton instance
export const sarvamAI = new SarvamAIClient();

// Convenience functions
export async function translate(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const result = await sarvamAI.translate(text, from, to);
  return result.translatedText;
}

export async function tts(
  text: string,
  language: string,
  voiceId?: string,
): Promise<string> {
  const result = await sarvamAI.textToSpeech(text, language, voiceId);
  return result.audioUrl;
}

export function summarizeAdvisory(
  structuredAdvisory: {
    type: string;
    severity: string;
    title: string;
    description: string;
    actions?: { label: string; type: string; value: string }[];
  },
  language: string,
): Promise<{ summary: string; audioUrl?: string }> {
  return sarvamAI.summarizeAdvisory(structuredAdvisory, language);
}
