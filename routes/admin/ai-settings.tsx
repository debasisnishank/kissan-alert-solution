import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import {
  type AIProviderConfig,
  type AIProviderKind,
  getAIConfig,
  PROVIDER_PRESETS,
  setAIConfig,
} from "$lib/ai-settings.ts";
import { testProvider } from "$ai/llm.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface AISettingsData {
  config: AIProviderConfig;
  message?: { kind: "success" | "error"; text: string };
}

const PROVIDERS = Object.entries(PROVIDER_PRESETS) as Array<
  [AIProviderKind, (typeof PROVIDER_PRESETS)[AIProviderKind]]
>;

function adminGuard(ctx: { state: AuthState }): Response | null {
  if (!ctx.state.session) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }
  if (!["admin", "tenant_admin"].includes(ctx.state.session.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

export const handler: Handlers<AISettingsData, AuthState> = {
  async GET(_req, ctx) {
    const authError = adminGuard(ctx);
    if (authError) return authError;
    const config = await getAIConfig(ctx.state.session!.tenantId);
    return ctx.render({ config });
  },

  async POST(req, ctx) {
    const authError = adminGuard(ctx);
    if (authError) return authError;
    const tenantId = ctx.state.session!.tenantId;

    const form = await req.formData();
    const existing = await getAIConfig(tenantId);
    const provider = (form.get("provider")?.toString() ||
      "gemini") as AIProviderKind;
    const submittedKey = form.get("apiKey")?.toString().trim() ?? "";
    const config: AIProviderConfig = {
      provider: provider in PROVIDER_PRESETS ? provider : "gemini",
      // Blank key field keeps the stored key (it is never echoed to the form)
      apiKey: submittedKey || existing.apiKey,
      model: form.get("model")?.toString().trim() ?? "",
      baseUrl: form.get("baseUrl")?.toString().trim() ?? "",
    };
    if (form.get("clearKey") === "on") config.apiKey = "";

    await setAIConfig(tenantId, config);

    let message: AISettingsData["message"] = {
      kind: "success",
      text: `Saved. Provider: ${PROVIDER_PRESETS[config.provider].label}.`,
    };

    if (form.get("action") === "save_test") {
      try {
        const reply = await testProvider(
          config,
          "Reply with exactly: PROVIDER OK",
        );
        message = {
          kind: "success",
          text: `Saved and tested — ${
            PROVIDER_PRESETS[config.provider].label
          } replied: "${reply.trim().slice(0, 80)}"`,
        };
      } catch (e) {
        message = {
          kind: "error",
          text: `Saved, but the test call failed: ${
            e instanceof Error ? e.message.slice(0, 200) : "unknown error"
          }`,
        };
      }
    }

    return ctx.render({ config, message });
  },
};

export default function AISettingsPage(
  { data }: PageProps<AISettingsData>,
) {
  const { config, message } = data;

  return (
    <AdminLayout title="AI Provider" currentPage="ai-settings">
      <div class="max-w-2xl">
        <h1 class="text-xl font-bold text-gray-900 mb-1">AI Provider</h1>
        <p class="text-sm text-gray-500 mb-4">
          Which LLM powers chat, crop-photo analysis, and voice-note analysis.
          If the configured provider fails, the app automatically falls back to
          Gemini, then to offline fallbacks — the demo never breaks.
        </p>

        {message && (
          <div
            class={`rounded-lg p-3 mb-4 text-sm ${
              message.kind === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <form method="POST" class="bg-white border rounded-xl p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <select
              name="provider"
              class="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {PROVIDERS.map(([kind, preset]) => (
                <option
                  key={kind}
                  value={kind}
                  selected={config.provider === kind}
                >
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              API key
            </label>
            <input
              type="password"
              name="apiKey"
              placeholder={config.apiKey
                ? "•••••••• (saved — leave blank to keep)"
                : "Paste the provider's API key"}
              class="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              autocomplete="off"
            />
            <label class="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <input type="checkbox" name="clearKey" />{" "}
              Clear the saved key (Gemini then uses the .env key)
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Model <span class="text-gray-400">(blank = default)</span>
              </label>
              <input
                type="text"
                name="model"
                value={config.model}
                placeholder={PROVIDER_PRESETS[config.provider].defaultModel ||
                  "model id"}
                class="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Base URL <span class="text-gray-400">(custom only)</span>
              </label>
              <input
                type="text"
                name="baseUrl"
                value={config.baseUrl}
                placeholder="https://…/v1"
                class="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
            <p>
              <span class="font-medium">Defaults:</span> OpenAI{" "}
              {PROVIDER_PRESETS.openai.defaultModel} · Groq{" "}
              {PROVIDER_PRESETS.groq.defaultModel} · OpenRouter{" "}
              {PROVIDER_PRESETS.openrouter.defaultModel} · Claude{" "}
              {PROVIDER_PRESETS.claude.defaultModel}
            </p>
            <p>
              Voice-note transcription always uses Gemini (audio-capable); photo
              analysis needs a vision-capable model on the chosen provider.
            </p>
          </div>

          <div class="flex gap-2">
            <button
              type="submit"
              name="action"
              value="save"
              class="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium"
            >
              Save
            </button>
            <button
              type="submit"
              name="action"
              value="save_test"
              class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium"
            >
              Save & test live
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
