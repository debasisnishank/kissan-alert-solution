import { AppShell } from "$components/Layout.tsx";
import { SITE_NAME } from "$utils/constants.ts";

export default function AboutPage() {
  return (
    <AppShell title="About" showBack>
      <div class="space-y-4">
        {/* App Info */}
        <div class="bg-white rounded-xl border p-6 text-center">
          <div class="w-20 h-20 bg-primary-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <svg
              class="w-12 h-12 text-primary-600"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">{SITE_NAME}</h1>
          <p class="text-gray-500 mt-1">Smart Agricultural Advisory Platform</p>
          <p class="text-sm text-gray-400 mt-2">Version 1.0.0</p>
        </div>

        {/* Features */}
        <div class="bg-white rounded-xl border p-4">
          <h2 class="font-semibold text-gray-900 mb-3">Features</h2>
          <ul class="space-y-2 text-sm text-gray-600">
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              Satellite-based crop health monitoring
            </li>
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              AI-powered farming advisories
            </li>
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              Real-time weather alerts
            </li>
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              Market price updates
            </li>
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              Crop calendar and reminders
            </li>
            <li class="flex items-center gap-2">
              <span class="text-green-500">✓</span>
              Multi-language support
            </li>
          </ul>
        </div>

        {/* Data Sources */}
        <div class="bg-white rounded-xl border p-4">
          <h2 class="font-semibold text-gray-900 mb-3">Data Sources</h2>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="p-2 bg-gray-50 rounded-lg">
              <p class="font-medium text-gray-700">Satellite</p>
              <p class="text-xs text-gray-500">Sentinel-2, Landsat</p>
            </div>
            <div class="p-2 bg-gray-50 rounded-lg">
              <p class="font-medium text-gray-700">Weather</p>
              <p class="text-xs text-gray-500">Open-Meteo, IMD</p>
            </div>
            <div class="p-2 bg-gray-50 rounded-lg">
              <p class="font-medium text-gray-700">Soil</p>
              <p class="text-xs text-gray-500">ISRIC SoilGrids</p>
            </div>
            <div class="p-2 bg-gray-50 rounded-lg">
              <p class="font-medium text-gray-700">Market</p>
              <p class="text-xs text-gray-500">Agmarknet</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div class="bg-white rounded-xl border p-4">
          <h2 class="font-semibold text-gray-900 mb-3">Contact</h2>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Support:</span> support@compass.app
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Feedback:</span> feedback@compass.app
            </p>
          </div>
        </div>

        {/* Legal */}
        <div class="text-center text-xs text-gray-400 space-y-1">
          <p>
            <a href="#" class="hover:underline">Terms of Service</a>
            {" · "}
            <a href="#" class="hover:underline">Privacy Policy</a>
          </p>
          <p>© 2024 {SITE_NAME}. All rights reserved.</p>
        </div>
      </div>
    </AppShell>
  );
}
