import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { getBankStats, listLoans } from "$lib/bank.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface BankDashboardData {
  stats: {
    totalCustomers: number;
    totalFarms: number;
    totalLoanAmount: number;
    averageAgriScore: number;
    pendingAssessments: number;
    approvedThisMonth: number;
  };
  recentAssessments: Array<{
    id: string;
    farmerName: string;
    farmName: string;
    agriScore: number;
    loanAmount: number;
    status: string;
    date: string;
  }>;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}

export const handler: Handlers<BankDashboardData, AuthState> = {
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

    // Get real stats from database
    const bankStats = await getBankStats(tenantId, bankOfficerId);

    const stats = {
      totalCustomers: bankStats.totalCustomers,
      totalFarms: bankStats.totalFarms,
      totalLoanAmount: bankStats.totalLoanAmount,
      averageAgriScore: bankStats.averageAgriScore,
      pendingAssessments: bankStats.pendingAssessments,
      approvedThisMonth: bankStats.approvedThisMonth,
    };

    // Get recent loan applications
    const { loans } = await listLoans(tenantId, {
      bankOfficerId,
      limit: 10,
    });

    const recentAssessments = loans.map((loan) => ({
      id: loan.id,
      farmerName: loan.customerName || "Unknown",
      farmName: loan.farmName || "N/A",
      agriScore: loan.agriScore || 0,
      loanAmount: loan.requestedAmount,
      status: loan.status,
      date: formatRelativeDate(loan.createdAt),
    }));

    return ctx.render({
      stats,
      recentAssessments,
      riskDistribution: bankStats.riskDistribution,
    });
  },
};

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export default function BankDashboard({ data }: PageProps<BankDashboardData>) {
  const { stats, recentAssessments, riskDistribution } = data;

  const statusColors: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    submitted: "bg-yellow-100 text-yellow-700",
    under_review: "bg-blue-100 text-blue-700",
    rejected: "bg-red-100 text-red-700",
    disbursed: "bg-green-100 text-green-700",
    draft: "bg-gray-100 text-gray-700",
    closed: "bg-gray-100 text-gray-700",
  };

  return (
    <Layout title="Bank Officer Portal">
      <div class="min-h-screen bg-gray-50">
        {/* Header */}
        <header class="bg-white border-b">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div>
                <h1 class="text-xl font-bold text-gray-900">
                  Bank Officer Portal
                </h1>
                <p class="text-sm text-gray-500">
                  Compass Agricultural Credit Assessment
                </p>
              </div>
            </div>
            <nav class="flex items-center gap-4 text-sm overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
              <a href="/bank" class="text-indigo-600 font-medium">Dashboard</a>
              <a
                href="/bank/customers"
                class="text-gray-600 hover:text-gray-900"
              >
                Customers
              </a>
              <a
                href="/bank/assessments"
                class="text-gray-600 hover:text-gray-900"
              >
                Assessments
              </a>
              <a
                href="/bank/portfolio"
                class="text-gray-600 hover:text-gray-900"
              >
                Portfolio
              </a>
              <a
                href="/bank/emi-calculator"
                class="text-gray-600 hover:text-gray-900"
              >
                EMI Calc
              </a>
              <a href="/app" class="text-gray-500 hover:text-gray-900">
                ← Exit
              </a>
            </nav>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Stats Grid */}
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatCard
              label="Total Customers"
              value={stats.totalCustomers}
              icon="users"
            />
            <StatCard
              label="Total Farms"
              value={stats.totalFarms}
              icon="farm"
            />
            <StatCard
              label="Loan Disbursed"
              value={stats.totalLoanAmount > 0
                ? `₹${(stats.totalLoanAmount / 100000).toFixed(1)}L`
                : "₹0"}
              icon="money"
            />
            <StatCard
              label="Avg Agri Score"
              value={stats.averageAgriScore}
              icon="score"
              color="green"
            />
            <StatCard
              label="Pending"
              value={stats.pendingAssessments}
              icon="pending"
              color="yellow"
            />
            <StatCard
              label="Approved (Month)"
              value={stats.approvedThisMonth}
              icon="check"
              color="green"
            />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Assessments */}
            <div class="lg:col-span-2 bg-white rounded-xl border p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="font-semibold text-gray-900">
                  Recent Loan Applications
                </h2>
                <a
                  href="/bank/assessments"
                  class="text-sm text-indigo-600 hover:underline"
                >
                  View All
                </a>
              </div>
              {recentAssessments.length > 0
                ? (
                  <div class="overflow-x-auto">
                    <table class="w-full">
                      <thead>
                        <tr class="text-left text-xs text-gray-500 uppercase border-b">
                          <th class="pb-2">Farmer</th>
                          <th class="pb-2">Farm</th>
                          <th class="pb-2">Score</th>
                          <th class="pb-2">Amount</th>
                          <th class="pb-2">Status</th>
                          <th class="pb-2">Date</th>
                          <th class="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody class="divide-y">
                        {recentAssessments.map((a) => (
                          <tr key={a.id} class="hover:bg-gray-50">
                            <td class="py-3 font-medium text-gray-900">
                              {a.farmerName}
                            </td>
                            <td class="py-3 text-gray-600">{a.farmName}</td>
                            <td class="py-3">
                              {a.agriScore > 0
                                ? (
                                  <span
                                    class={`font-bold ${
                                      a.agriScore >= 70
                                        ? "text-green-600"
                                        : a.agriScore >= 50
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {a.agriScore}
                                  </span>
                                )
                                : <span class="text-gray-400">-</span>}
                            </td>
                            <td class="py-3 text-gray-900">
                              ₹{(a.loanAmount / 1000).toFixed(0)}K
                            </td>
                            <td class="py-3">
                              <span
                                class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                                  statusColors[a.status] ||
                                  "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {a.status.replace("_", " ")}
                              </span>
                            </td>
                            <td class="py-3 text-sm text-gray-500">{a.date}</td>
                            <td class="py-3">
                              <a
                                href={`/bank/assessment/${a.id}`}
                                class="text-indigo-600 text-sm hover:underline"
                              >
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
                : (
                  <div class="text-center py-8 text-gray-500">
                    <p>No loan applications yet.</p>
                    <p class="text-sm mt-2">
                      Add customers and create assessments to get started.
                    </p>
                  </div>
                )}
            </div>

            {/* Risk Distribution */}
            <div class="bg-white rounded-xl border p-6">
              <h2 class="font-semibold text-gray-900 mb-4">
                Portfolio Risk Distribution
              </h2>
              <div class="space-y-4">
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-green-600 font-medium">
                      Low Risk (Score ≥70)
                    </span>
                    <span class="text-gray-600">{riskDistribution.low}%</span>
                  </div>
                  <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-green-500 rounded-full"
                      style={`width: ${riskDistribution.low}%`}
                    />
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-yellow-600 font-medium">
                      Medium Risk (50-69)
                    </span>
                    <span class="text-gray-600">
                      {riskDistribution.medium}%
                    </span>
                  </div>
                  <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-yellow-500 rounded-full"
                      style={`width: ${riskDistribution.medium}%`}
                    />
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-red-600 font-medium">
                      High Risk (Score &lt;50)
                    </span>
                    <span class="text-gray-600">{riskDistribution.high}%</span>
                  </div>
                  <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-red-500 rounded-full"
                      style={`width: ${riskDistribution.high}%`}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div class="mt-6 pt-6 border-t space-y-2">
                <a
                  href="/bank/customers/search"
                  class="flex items-center gap-2 w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Search / Add Customer
                </a>
                <a
                  href="/bank/assessment/new"
                  class="flex items-center gap-2 w-full px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  New Loan Assessment
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}

function StatCard(
  { label, value, icon, color = "gray" }: {
    label: string;
    value: string | number;
    icon: string;
    color?: string;
  },
) {
  const colorClasses: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-600",
    yellow: "bg-yellow-100 text-yellow-600",
    red: "bg-red-100 text-red-600",
  };

  return (
    <div class="bg-white rounded-xl border p-4">
      <div
        class={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
          colorClasses[color]
        }`}
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {icon === "users" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          )}
          {icon === "farm" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          )}
          {icon === "money" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
          {icon === "score" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          )}
          {icon === "pending" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
          {icon === "check" && (
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
      </div>
      <p class="text-2xl font-bold text-gray-900">{value}</p>
      <p class="text-xs text-gray-500">{label}</p>
    </div>
  );
}
