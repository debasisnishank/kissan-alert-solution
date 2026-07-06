import { Handlers } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import LoginForm from "$islands/LoginForm.tsx";
import { SITE_NAME } from "$utils/constants.ts";
import { validateSession } from "$lib/auth.ts";
import { getSessionToken } from "../middlewares/auth.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    // Check if user is already logged in
    const token = getSessionToken(req);
    if (token) {
      const session = await validateSession(token);
      if (session) {
        // Redirect to app if already logged in
        return new Response(null, {
          status: 302,
          headers: { Location: "/app" },
        });
      }
    }
    return ctx.render();
  },
};

export default function LoginPage() {
  return (
    <Layout title="Login">
      <div class="min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 flex items-center justify-center px-4">
        <div class="w-full max-w-sm">
          {/* Logo */}
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
              <svg
                class="w-10 h-10 text-primary-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-white">{SITE_NAME}</h1>
            <p class="text-primary-200 text-sm mt-1">
              Smart Farming Advisories
            </p>
          </div>

          {/* Login Card */}
          <div class="bg-white rounded-2xl shadow-xl p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-1">Welcome</h2>
            <p class="text-sm text-gray-500 mb-6">
              Sign in with your username and password
            </p>

            <LoginForm />
          </div>

          {/* Footer */}
          <p class="text-center text-primary-200 text-xs mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </Layout>
  );
}
