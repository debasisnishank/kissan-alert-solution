import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { getPortfolioAnalytics, type PortfolioAnalytics } from "$lib/bank.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface PortfolioPageData {
  analytics: PortfolioAnalytics;
}

export const handler: Handlers<PortfolioPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const allowedRoles = ["bank_officer", "admin", "tenant_admin"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, { status: 302, headers: { Location: "/app" } });
    }

    const tenantId = ctx.state.session.tenantId;
    const bankOfficerId = ctx.state.session.role === "bank_officer"
      ? ctx.state.session.userId
      : undefined;

    const analytics = await getPortfolioAnalytics(tenantId, bankOfficerId);

    return ctx.render({ analytics });
  },
};

export default function PortfolioPage({ data }: PageProps<PortfolioPageData>) {
  const { analytics } = data;

  const formatCurrency = (rawAmount: number | string) => {
    // NUMERIC columns arrive as strings from deno-postgres
    const amount = Number(rawAmount) || 0;
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toFixed(0)}`;
  };

  const loanTypeLabels: Record<string, string> = {
    crop_loan: "Crop Loan",
    term_loan: "Term Loan",
    equipment_loan: "Equipment",
    dairy_loan: "Dairy",
    irrigation_loan: "Irrigation",
    storage_loan: "Storage",
    land_development: "Land Dev",
  };

  const statusLabels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    disbursed: "Disbursed",
    closed: "Closed",
  };

  const totalLoans = Object.values(analytics.loansByStatus).reduce(
    (a, b) => a + b,
    0,
  );
  const totalRisk = analytics.riskBreakdown.low +
    analytics.riskBreakdown.medium +
    analytics.riskBreakdown.high;

  return (
    <Layout title="Portfolio Analytics - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a href="/bank" class="text-gray-500 hover:text-gray-700">
                ← Back
              </a>
              <div>
                <h1 class="text-xl font-bold text-gray-900">
                  Portfolio Analytics
                </h1>
                <p class="text-sm text-gray-500">
                  Comprehensive loan portfolio overview
                </p>
              </div>
            </div>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Key Metrics */}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">Total Disbursed</p>
              <p class="text-2xl font-bold text-gray-900">
                {formatCurrency(analytics.totalDisbursed)}
              </p>
            </div>
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">Outstanding</p>
              <p class="text-2xl font-bold text-orange-600">
                {formatCurrency(analytics.totalOutstanding)}
              </p>
            </div>
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">Collected</p>
              <p class="text-2xl font-bold text-green-600">
                {formatCurrency(analytics.totalCollected)}
              </p>
            </div>
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">NPA</p>
              <p class="text-2xl font-bold text-red-600">
                {analytics.npaPercentage.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Average Stats */}
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">Average Loan Size</p>
              <p class="text-3xl font-bold text-gray-900">
                {formatCurrency(analytics.averageLoanSize)}
              </p>
            </div>
            <div class="bg-white rounded-xl p-6 border">
              <p class="text-sm text-gray-500">Average Tenure</p>
              <p class="text-3xl font-bold text-gray-900">
                {Math.round(analytics.averageTenure)} months
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Loans by Type */}
            <div class="bg-white rounded-xl p-6 border">
              <h3 class="font-semibold text-gray-900 mb-4">Loans by Type</h3>
              {Object.keys(analytics.loansByType).length > 0
                ? (
                  <div class="space-y-3">
                    {Object.entries(analytics.loansByType).map(
                      ([type, data]) => (
                        <div
                          key={type}
                          class="flex items-center justify-between"
                        >
                          <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rounded-full bg-indigo-500" />
                            <span class="text-gray-700">
                              {loanTypeLabels[type] || type}
                            </span>
                          </div>
                          <div class="text-right">
                            <p class="font-medium text-gray-900">
                              {formatCurrency(data.amount)}
                            </p>
                            <p class="text-xs text-gray-500">
                              {data.count} loans
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )
                : (
                  <p class="text-gray-500 text-center py-4">
                    No disbursed loans yet
                  </p>
                )}
            </div>

            {/* Loans by Status */}
            <div class="bg-white rounded-xl p-6 border">
              <h3 class="font-semibold text-gray-900 mb-4">Loans by Status</h3>
              {totalLoans > 0
                ? (
                  <div class="space-y-3">
                    {Object.entries(analytics.loansByStatus).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          class="flex items-center justify-between"
                        >
                          <div class="flex items-center gap-3">
                            <div
                              class={`w-3 h-3 rounded-full ${
                                status === "disbursed"
                                  ? "bg-green-500"
                                  : status === "approved"
                                  ? "bg-blue-500"
                                  : status === "rejected"
                                  ? "bg-red-500"
                                  : status === "under_review"
                                  ? "bg-yellow-500"
                                  : "bg-gray-400"
                              }`}
                            />
                            <span class="text-gray-700">
                              {statusLabels[status] || status}
                            </span>
                          </div>
                          <div class="text-right">
                            <p class="font-medium text-gray-900">{count}</p>
                            <p class="text-xs text-gray-500">
                              {((count / totalLoans) * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )
                : <p class="text-gray-500 text-center py-4">No loans yet</p>}
            </div>
          </div>

          {/* Risk Distribution */}
          <div class="bg-white rounded-xl p-6 border">
            <h3 class="font-semibold text-gray-900 mb-4">Risk Distribution</h3>
            {totalRisk > 0
              ? (
                <div class="space-y-4">
                  {/* Risk Bar */}
                  <div class="h-8 rounded-lg overflow-hidden flex">
                    <div
                      class="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{
                        width: `${
                          (analytics.riskBreakdown.low / totalRisk) * 100
                        }%`,
                      }}
                    >
                      {analytics.riskBreakdown.low > 0 && "Low"}
                    </div>
                    <div
                      class="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{
                        width: `${
                          (analytics.riskBreakdown.medium / totalRisk) * 100
                        }%`,
                      }}
                    >
                      {analytics.riskBreakdown.medium > 0 && "Medium"}
                    </div>
                    <div
                      class="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{
                        width: `${
                          (analytics.riskBreakdown.high / totalRisk) * 100
                        }%`,
                      }}
                    >
                      {analytics.riskBreakdown.high > 0 && "High"}
                    </div>
                  </div>

                  {/* Risk Legend */}
                  <div class="flex justify-around">
                    <div class="text-center">
                      <div class="flex items-center justify-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-green-500" />
                        <span class="text-sm text-gray-600">Low Risk</span>
                      </div>
                      <p class="text-lg font-semibold text-gray-900">
                        {analytics.riskBreakdown.low}
                      </p>
                    </div>
                    <div class="text-center">
                      <div class="flex items-center justify-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-yellow-500" />
                        <span class="text-sm text-gray-600">Medium Risk</span>
                      </div>
                      <p class="text-lg font-semibold text-gray-900">
                        {analytics.riskBreakdown.medium}
                      </p>
                    </div>
                    <div class="text-center">
                      <div class="flex items-center justify-center gap-2">
                        <div class="w-3 h-3 rounded-full bg-red-500" />
                        <span class="text-sm text-gray-600">High Risk</span>
                      </div>
                      <p class="text-lg font-semibold text-gray-900">
                        {analytics.riskBreakdown.high}
                      </p>
                    </div>
                  </div>
                </div>
              )
              : (
                <p class="text-gray-500 text-center py-4">
                  No risk data available
                </p>
              )}
          </div>

          {/* Monthly Disbursement */}
          <div class="bg-white rounded-xl p-6 border">
            <h3 class="font-semibold text-gray-900 mb-4">
              Monthly Disbursement (Last 6 Months)
            </h3>
            {analytics.monthlyDisbursement.length > 0
              ? (
                <div class="space-y-2">
                  {analytics.monthlyDisbursement.map((m) => {
                    const maxAmount = Math.max(
                      ...analytics.monthlyDisbursement.map((x) => x.amount),
                    );
                    const width = maxAmount > 0
                      ? (m.amount / maxAmount) * 100
                      : 0;
                    return (
                      <div key={m.month} class="flex items-center gap-3">
                        <span class="w-20 text-sm text-gray-600">
                          {m.month}
                        </span>
                        <div class="flex-1 bg-gray-100 rounded-full h-6">
                          <div
                            class="bg-indigo-500 h-6 rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(width, 5)}%` }}
                          >
                            <span class="text-xs text-white font-medium">
                              {formatCurrency(m.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
              : (
                <p class="text-gray-500 text-center py-4">
                  No disbursements in the last 6 months
                </p>
              )}
          </div>
        </main>
      </div>
    </Layout>
  );
}
