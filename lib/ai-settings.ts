/**
 * Tenant-configurable AI provider settings, stored in tenants.config.aiProvider.
 * Configured from /admin/ai-settings.
 */

import { query, queryOne } from "$db/client.ts";

export type AIProviderKind =
  | "gemini"
  | "claude"
  | "openai"
  | "groq"
  | "openrouter"
  | "custom";

export interface AIProviderConfig {
  provider: AIProviderKind;
  /** Empty for gemini = use GEMINI_API_KEY env */
  apiKey: string;
  /** Model id; empty = provider default */
  model: string;
  /** Only used by "custom" (any OpenAI-compatible endpoint) */
  baseUrl: string;
}

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: "gemini",
  apiKey: "",
  model: "",
  baseUrl: "",
};

export const PROVIDER_PRESETS: Record<
  AIProviderKind,
  { label: string; defaultModel: string; baseUrl: string; keyHint: string }
> = {
  gemini: {
    label: "Google Gemini (default)",
    defaultModel: "gemini-2.0-flash",
    baseUrl: "",
    keyHint: "Uses GEMINI_API_KEY from .env when left blank",
  },
  claude: {
    label: "Anthropic Claude",
    defaultModel: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.anthropic.com",
    keyHint: "sk-ant-…",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-…",
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    keyHint: "gsk_…",
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "google/gemini-2.0-flash-001",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-…",
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    defaultModel: "",
    baseUrl: "",
    keyHint: "API key for your endpoint",
  },
};

// Small cache so every AI call doesn't hit the DB
const cache = new Map<string, { config: AIProviderConfig; at: number }>();
const CACHE_TTL_MS = 30_000;

export async function getAIConfig(tenantId: string): Promise<AIProviderConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;

  const row = await queryOne<{ config: Record<string, unknown> | null }>(
    `SELECT config FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const raw = (row?.config as { aiProvider?: Partial<AIProviderConfig> })
    ?.aiProvider;
  const config: AIProviderConfig = {
    ...DEFAULT_AI_CONFIG,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
  cache.set(tenantId, { config, at: Date.now() });
  return config;
}

export async function setAIConfig(
  tenantId: string,
  config: AIProviderConfig,
): Promise<void> {
  await query(
    `UPDATE tenants
     SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('aiProvider', $2::jsonb),
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, JSON.stringify(config)],
  );
  cache.delete(tenantId);
}
