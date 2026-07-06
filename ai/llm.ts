/**
 * Provider-agnostic LLM router.
 *
 * Reads the tenant's configured provider (/admin/ai-settings) and dispatches:
 * - gemini            → existing Gemini client (key rotation built in)
 * - openai/groq/openrouter/custom → OpenAI-compatible chat completions
 * - claude            → Anthropic Messages API
 *
 * Any configured-provider failure falls back to Gemini (env key), so the
 * default behavior with no configuration is exactly the old behavior.
 * Audio input is Gemini-only (multimodal audio); other providers fall back.
 */

import { gemini } from "./gemini.ts";
import {
  type AIProviderConfig,
  getAIConfig,
  PROVIDER_PRESETS,
} from "$lib/ai-settings.ts";

interface GenOptions {
  temperature?: number;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible adapter (OpenAI, Groq, OpenRouter, custom endpoints)
// ---------------------------------------------------------------------------

type OpenAIContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;

async function openAICompatGenerate(
  config: AIProviderConfig,
  content: OpenAIContent,
  opts: GenOptions,
): Promise<string> {
  const preset = PROVIDER_PRESETS[config.provider];
  const baseUrl =
    (config.provider === "custom" ? config.baseUrl : preset.baseUrl).replace(
      /\/$/,
      "",
    );
  if (!baseUrl) throw new Error("Custom provider needs a base URL");
  const model = config.model || preset.defaultModel;
  if (!model) throw new Error("No model configured");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${config.provider} API error: ${response.status} - ${
        body.slice(0, 300)
      }`,
    );
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ---------------------------------------------------------------------------
// Anthropic Claude adapter
// ---------------------------------------------------------------------------

type ClaudeContent = Array<
  | { type: "text"; text: string }
  | {
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }
>;

async function claudeGenerate(
  config: AIProviderConfig,
  content: ClaudeContent,
  opts: GenOptions,
): Promise<string> {
  const model = config.model || PROVIDER_PRESETS.claude.defaultModel;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Claude API error: ${response.status} - ${body.slice(0, 300)}`,
    );
  }
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function usesConfiguredProvider(config: AIProviderConfig): boolean {
  return config.provider !== "gemini" && !!config.apiKey;
}

/**
 * Run a text prompt through the configured provider for a one-off test.
 * Unlike the fallback-wrapped functions below, errors propagate.
 */
export function testProvider(
  config: AIProviderConfig,
  prompt: string,
): Promise<string> {
  if (config.provider === "claude") {
    return claudeGenerate(config, [{ type: "text", text: prompt }], {
      maxTokens: 100,
    });
  }
  if (config.provider !== "gemini") {
    return openAICompatGenerate(config, prompt, { maxTokens: 100 });
  }
  return gemini.generate(prompt);
}

export async function llmGenerate(
  tenantId: string,
  prompt: string,
  opts: GenOptions = {},
): Promise<string> {
  const config = await getAIConfig(tenantId);
  if (usesConfiguredProvider(config)) {
    try {
      if (config.provider === "claude") {
        return await claudeGenerate(
          config,
          [{ type: "text", text: prompt }],
          opts,
        );
      }
      return await openAICompatGenerate(config, prompt, opts);
    } catch (e) {
      console.error(
        `[LLM] ${config.provider} failed, falling back to Gemini:`,
        e,
      );
    }
  }
  return await gemini.generate(prompt);
}

export async function llmGenerateWithImage(
  tenantId: string,
  prompt: string,
  imageBase64: string,
  opts: GenOptions = {},
): Promise<string> {
  const config = await getAIConfig(tenantId);
  if (usesConfiguredProvider(config)) {
    try {
      if (config.provider === "claude") {
        return await claudeGenerate(config, [
          { type: "text", text: prompt },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageBase64,
            },
          },
        ], opts);
      }
      return await openAICompatGenerate(config, [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
        },
      ], opts);
    } catch (e) {
      console.error(
        `[LLM] ${config.provider} vision failed, falling back to Gemini:`,
        e,
      );
    }
  }
  return await gemini.generateWithImage(prompt, imageBase64);
}

/**
 * Audio understanding stays on Gemini (the only configured-provider path
 * with native audio input); non-Gemini configs silently use Gemini here.
 */
export function llmGenerateWithAudio(
  _tenantId: string,
  prompt: string,
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  return gemini.generateWithAudio(prompt, audioBase64, mimeType);
}
