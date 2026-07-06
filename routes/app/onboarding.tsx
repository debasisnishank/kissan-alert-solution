import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import type { AuthState } from "../../middlewares/auth.ts";
import { query } from "$db/client.ts";
import { SITE_NAME } from "$utils/constants.ts";

interface OnboardingData {
  userName: string;
  hasFarms: boolean;
}

export const handler: Handlers<OnboardingData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    // Check if user already has farms
    const farms = await query<{ id: string }>(
      `SELECT id FROM farms WHERE farmer_id = $1 AND tenant_id = $2 LIMIT 1`,
      [ctx.state.session.userId, ctx.state.session.tenantId],
    );

    if (farms.length > 0) {
      // User has farms, redirect to app
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    return ctx.render({
      userName: ctx.state.user.name,
      hasFarms: false,
    });
  },
};

export default function OnboardingPage({ data }: PageProps<OnboardingData>) {
  return (
    <Layout title="Welcome">
      <div class="min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 flex items-center justify-center px-4">
        <div class="w-full max-w-md">
          {/* Welcome Header */}
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-4">
              <span class="text-4xl">👋</span>
            </div>
            <h1 class="text-2xl font-bold text-white mb-2">
              Welcome to {SITE_NAME}!
            </h1>
            <p class="text-primary-100">
              Hello{" "}
              <span class="font-semibold">{data.userName}</span>, let's set up
              your first farm.
            </p>
          </div>

          {/* Card */}
          <div class="bg-white rounded-2xl shadow-xl p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Get Started in 3 Steps
            </h2>

            <div class="space-y-4 mb-6">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  1
                </div>
                <div>
                  <p class="font-medium text-gray-900">Add Your Farm</p>
                  <p class="text-sm text-gray-500">
                    Draw your farm boundary on the map or enter location
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  2
                </div>
                <div>
                  <p class="font-medium text-gray-900">Declare Your Crop</p>
                  <p class="text-sm text-gray-500">
                    Tell us what you're growing and when you sowed
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  3
                </div>
                <div>
                  <p class="font-medium text-gray-900">Get AI Advisories</p>
                  <p class="text-sm text-gray-500">
                    Receive personalized recommendations for your farm
                  </p>
                </div>
              </div>
            </div>

            <a
              href="/app/farm/add"
              class="block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg text-center transition-colors"
            >
              Add My First Farm →
            </a>

            <p class="text-xs text-gray-400 text-center mt-4">
              Takes only 2 minutes to set up
            </p>
          </div>

          {/* Features Preview */}
          <div class="mt-6 grid grid-cols-3 gap-3">
            <div class="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
              <span class="text-2xl">🛰️</span>
              <p class="text-xs text-white mt-1">Satellite Data</p>
            </div>
            <div class="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
              <span class="text-2xl">🤖</span>
              <p class="text-xs text-white mt-1">AI Advisories</p>
            </div>
            <div class="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
              <span class="text-2xl">📊</span>
              <p class="text-xs text-white mt-1">Crop Health</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
