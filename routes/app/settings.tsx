import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import { SUPPORTED_LANGUAGES } from "$utils/constants.ts";

interface SettingsPageData {
  user: {
    name: string;
    phone: string;
    language: string;
  };
  preferences: {
    alertTypes: string[];
    voiceAlerts: boolean;
    smsAlerts: boolean;
    pushEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  };
}

export const handler: Handlers<SettingsPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { user } = ctx.state;

    // Get user preferences
    const prefs = await query<{
      key: string;
      value: string;
    }>(
      `SELECT key, value FROM user_preferences WHERE user_id = $1`,
      [user.id],
    );

    const prefMap = new Map(prefs.map((p) => [p.key, p.value]));

    return ctx.render({
      user: {
        name: user.name,
        phone: user.phone,
        language: user.language,
      },
      preferences: {
        alertTypes: JSON.parse(
          prefMap.get("alert_types") ||
            '["water_stress","pest_risk","weather","harvest"]',
        ),
        voiceAlerts: prefMap.get("voice_alerts") !== "false",
        smsAlerts: prefMap.get("sms_alerts") === "true",
        pushEnabled: prefMap.get("push_enabled") !== "false",
        quietHoursStart: prefMap.get("quiet_hours_start") || null,
        quietHoursEnd: prefMap.get("quiet_hours_end") || null,
      },
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, { status: 401 });
    }

    const { user } = ctx.state;
    const formData = await req.formData();

    const updates: Array<{ key: string; value: string }> = [];

    // Process form data
    const language = formData.get("language") as string;
    if (language) {
      await execute(
        `UPDATE users SET language = $1 WHERE id = $2`,
        [language, user.id],
      );
    }

    const alertTypes = formData.getAll("alert_types") as string[];
    updates.push({ key: "alert_types", value: JSON.stringify(alertTypes) });

    updates.push({
      key: "voice_alerts",
      value: formData.get("voice_alerts") === "on" ? "true" : "false",
    });
    updates.push({
      key: "sms_alerts",
      value: formData.get("sms_alerts") === "on" ? "true" : "false",
    });
    updates.push({
      key: "push_enabled",
      value: formData.get("push_enabled") === "on" ? "true" : "false",
    });

    const quietStart = formData.get("quiet_hours_start") as string;
    const quietEnd = formData.get("quiet_hours_end") as string;
    if (quietStart) {
      updates.push({ key: "quiet_hours_start", value: quietStart });
    }
    if (quietEnd) updates.push({ key: "quiet_hours_end", value: quietEnd });

    // Upsert preferences
    for (const { key, value } of updates) {
      await execute(
        `INSERT INTO user_preferences (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
        [user.id, key, value],
      );
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/app/settings?saved=1" },
    });
  },
};

export default function SettingsPage(
  { data, url }: PageProps<SettingsPageData>,
) {
  const { user, preferences } = data;
  const saved = url.searchParams.get("saved") === "1";

  const alertTypeOptions = [
    { id: "water_stress", label: "Water Stress Alerts" },
    { id: "pest_risk", label: "Pest Risk Alerts" },
    { id: "weather", label: "Weather Alerts" },
    { id: "harvest", label: "Harvest Readiness" },
    { id: "nutrient", label: "Nutrient Deficiency" },
    { id: "market", label: "Market Price Updates" },
  ];

  return (
    <AppShell title="Settings" showBack>
      {saved && (
        <div class="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">
          Settings saved successfully!
        </div>
      )}

      <form method="POST" class="space-y-6">
        {/* Profile Section */}
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <h2 class="font-semibold text-gray-900 mb-4">Profile</h2>

          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={user.name}
                disabled
                class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={user.phone}
                disabled
                class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                name="language"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option
                    key={lang.code}
                    value={lang.code}
                    selected={user.language === lang.code}
                  >
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Alert Preferences */}
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <h2 class="font-semibold text-gray-900 mb-4">Alert Preferences</h2>

          <div class="space-y-3">
            <p class="text-sm text-gray-500">
              Choose which alerts you receive:
            </p>
            {alertTypeOptions.map((opt) => (
              <label key={opt.id} class="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="alert_types"
                  value={opt.id}
                  checked={preferences.alertTypes.includes(opt.id)}
                  class="w-4 h-4 text-primary-600 rounded"
                />
                <span class="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Notification Channels */}
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <h2 class="font-semibold text-gray-900 mb-4">
            Notification Channels
          </h2>

          <div class="space-y-4">
            <label class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-700">Voice Alerts</p>
                <p class="text-xs text-gray-500">Play audio advisories</p>
              </div>
              <input
                type="checkbox"
                name="voice_alerts"
                checked={preferences.voiceAlerts}
                class="w-5 h-5 text-primary-600 rounded"
              />
            </label>

            <label class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-700">SMS Alerts</p>
                <p class="text-xs text-gray-500">Receive SMS notifications</p>
              </div>
              <input
                type="checkbox"
                name="sms_alerts"
                checked={preferences.smsAlerts}
                class="w-5 h-5 text-primary-600 rounded"
              />
            </label>

            <label class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-700">
                  Push Notifications
                </p>
                <p class="text-xs text-gray-500">Browser/app notifications</p>
              </div>
              <input
                type="checkbox"
                name="push_enabled"
                checked={preferences.pushEnabled}
                class="w-5 h-5 text-primary-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Quiet Hours */}
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <h2 class="font-semibold text-gray-900 mb-4">Quiet Hours</h2>
          <p class="text-sm text-gray-500 mb-3">
            Don't send notifications during these hours
          </p>

          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="time"
                name="quiet_hours_start"
                value={preferences.quietHoursStart || "22:00"}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div class="flex-1">
              <label class="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="time"
                name="quiet_hours_end"
                value={preferences.quietHoursEnd || "06:00"}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          class="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700"
        >
          Save Settings
        </button>
      </form>
    </AppShell>
  );
}
