import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import EMICalculatorIsland from "$islands/EMICalculator.tsx";
import type { AuthState } from "../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const allowedRoles = ["bank_officer", "admin", "tenant_admin", "farmer"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, { status: 302, headers: { Location: "/app" } });
    }

    return ctx.render({});
  },
};

export default function EMICalculatorPage(_props: PageProps) {
  return (
    <Layout title="EMI Calculator - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
            <a href="/bank" class="text-gray-500 hover:text-gray-700">
              ← Back
            </a>
            <div>
              <h1 class="text-xl font-bold text-gray-900">EMI Calculator</h1>
              <p class="text-sm text-gray-500">
                Calculate loan EMI and view repayment schedule
              </p>
            </div>
          </div>
        </header>

        <main class="max-w-4xl mx-auto px-6 py-6">
          <EMICalculatorIsland />
        </main>
      </div>
    </Layout>
  );
}
