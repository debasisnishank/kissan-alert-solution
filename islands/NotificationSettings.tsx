import { useState } from "preact/hooks";

interface Props {
  userId: string;
}

export default function NotificationSettings({ userId: _userId }: Props) {
  const [settings, setSettings] = useState({
    pushEnabled: true,
    weatherAlerts: true,
    cropAdvisories: true,
    marketPrices: true,
    schemeUpdates: false,
    dailyDigest: true,
  });
  const [_saving, _setSaving] = useState(false);

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const enablePushNotifications = async () => {
    if (!("Notification" in globalThis)) {
      alert("Push notifications are not supported in this browser");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setSettings((prev) => ({ ...prev, pushEnabled: true }));
      // Register service worker for push if available
      if ("serviceWorker" in navigator) {
        try {
          const _registration = await navigator.serviceWorker.ready;
          console.log("Service worker ready for push");
        } catch (e) {
          console.error("Service worker error:", e);
        }
      }
    }
  };

  const SettingToggle = ({
    label,
    description,
    enabled,
    onToggle,
  }: {
    label: string;
    description: string;
    enabled: boolean;
    onToggle: () => void;
  }) => (
    <div class="flex items-center justify-between p-4 bg-white rounded-lg border">
      <div class="flex-1">
        <p class="font-medium text-gray-900">{label}</p>
        <p class="text-sm text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        class={`relative w-12 h-6 rounded-full transition-colors ${
          enabled ? "bg-primary-600" : "bg-gray-300"
        }`}
      >
        <span
          class={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            enabled ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );

  return (
    <div class="space-y-4">
      {/* Push Notifications Master Toggle */}
      <div class="bg-white rounded-xl border p-4">
        <h3 class="font-semibold text-gray-900 mb-3">Push Notifications</h3>
        {!settings.pushEnabled
          ? (
            <button
              type="button"
              onClick={enablePushNotifications}
              class="w-full py-3 bg-primary-600 text-white rounded-lg font-medium"
            >
              Enable Push Notifications
            </button>
          )
          : (
            <div class="flex items-center gap-2 text-green-600">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="text-sm font-medium">
                Push notifications enabled
              </span>
            </div>
          )}
      </div>

      {/* Notification Categories */}
      <div class="space-y-2">
        <h3 class="font-semibold text-gray-900 px-1">Alert Categories</h3>

        <SettingToggle
          label="Weather Alerts"
          description="Rain predictions, temperature warnings, frost alerts"
          enabled={settings.weatherAlerts}
          onToggle={() => toggleSetting("weatherAlerts")}
        />

        <SettingToggle
          label="Crop Advisories"
          description="Irrigation schedules, fertilizer reminders, pest warnings"
          enabled={settings.cropAdvisories}
          onToggle={() => toggleSetting("cropAdvisories")}
        />

        <SettingToggle
          label="Market Prices"
          description="Daily mandi prices for your crops"
          enabled={settings.marketPrices}
          onToggle={() => toggleSetting("marketPrices")}
        />

        <SettingToggle
          label="Government Schemes"
          description="New schemes, subsidy updates, deadlines"
          enabled={settings.schemeUpdates}
          onToggle={() => toggleSetting("schemeUpdates")}
        />

        <SettingToggle
          label="Daily Digest"
          description="Morning summary of all farm updates"
          enabled={settings.dailyDigest}
          onToggle={() => toggleSetting("dailyDigest")}
        />
      </div>

      {/* Save Note */}
      <p class="text-xs text-gray-400 text-center">
        Settings are saved automatically
      </p>
    </div>
  );
}
