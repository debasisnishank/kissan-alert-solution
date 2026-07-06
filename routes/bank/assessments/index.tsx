import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { listLoans } from "$lib/bank.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface Loan {
  id: string;
  applicationNumber: string | null;
  customerName: string;
  customerPhone: string;
  farmName: string | null;
  loanType: string;
  requestedAmount: number;
  approvedAmount: number | null;
  status: string;
  agriScore: number | null;
  riskCategory: string | null;
  createdAt: Date;
}

interface AssessmentsPageData {
  loans: Loan[];
  total: number;
  page: number;
  status: string;
}

export const handler: Handlers<AssessmentsPageData, AuthState> = {
  async GET(req, ctx) {
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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const status = url.searchParams.get("status") || "";

    const limit = 20;
    const offset = (page - 1) * limit;

    const { loans: loansData, total } = await listLoans(tenantId, {
      bankOfficerId,
      status: status || undefined,
      limit,
      offset,
    });

    const loans: Loan[] = loansData.map((l) => ({
      id: l.id,
      applicationNumber: l.applicationNumber,
      customerName: l.customerName || "Unknown",
      customerPhone: l.customerPhone || "",
      farmName: l.farmName || null,
      loanType: l.loanType,
      requestedAmount: l.requestedAmount,
      approvedAmount: l.approvedAmount,
      status: l.status,
      agriScore: l.agriScore,
      riskCategory: l.riskCategory,
      createdAt: l.createdAt,
    }));

    return ctx.render({ loans, total, page, status });
  },
};

export default function AssessmentsPage(
  { data }: PageProps<AssessmentsPageData>,
) {
  const { loans, total, page, status } = data;
  const totalPages = Math.ceil(total / 20);

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-yellow-100 text-yellow-700",
    under_review: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    disbursed: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-700",
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

  return (
    <Layout title="Loan Assessments - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a href="/bank" class="text-gray-500 hover:text-gray-700">
                ← Back
              </a>
              <div>
                <h1 class="text-xl font-bold text-gray-900">
                  Loan Assessments
                </h1>
                <p class="text-sm text-gray-500">{total} total applications</p>
              </div>
            </div>
            <a
              href="/bank/assessment/new"
              class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              + New Assessment
            </a>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-6 py-6">
          {/* Filters */}
          <div class="mb-6 flex gap-2 flex-wrap">
            <a
              href="/bank/assessments"
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                !status
                  ? "bg-indigo-600 text-white"
                  : "bg-white border text-gray-600 hover:bg-gray-50"
              }`}
            >
              All
            </a>
            {[
              "draft",
              "submitted",
              "under_review",
              "approved",
              "rejected",
              "disbursed",
            ].map((s) => (
              <a
                key={s}
                href={`/bank/assessments?status=${s}`}
                class={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                  status === s
                    ? "bg-indigo-600 text-white"
                    : "bg-white border text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s.replace("_", " ")}
              </a>
            ))}
          </div>

          {/* Loans Table */}
          <div class="bg-white rounded-xl border overflow-hidden">
            {loans.length > 0
              ? (
                <table class="w-full">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Application
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Customer
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Agri Score
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Risk
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    {loans.map((loan) => (
                      <tr key={loan.id} class="hover:bg-gray-50">
                        <td class="px-4 py-4">
                          <p class="font-medium text-gray-900 text-sm">
                            {loan.applicationNumber || loan.id.slice(0, 8)}
                          </p>
                          {loan.farmName && (
                            <p class="text-xs text-gray-500">{loan.farmName}</p>
                          )}
                        </td>
                        <td class="px-4 py-4">
                          <p class="font-medium text-gray-900 text-sm">
                            {loan.customerName}
                          </p>
                          <p class="text-xs text-gray-500">
                            {loan.customerPhone}
                          </p>
                        </td>
                        <td class="px-4 py-4 text-sm text-gray-600">
                          {loanTypeLabels[loan.loanType] || loan.loanType}
                        </td>
                        <td class="px-4 py-4">
                          <p class="text-sm text-gray-900">
                            ₹{(loan.requestedAmount / 1000).toFixed(0)}K
                          </p>
                          {loan.approvedAmount && (
                            <p class="text-xs text-green-600">
                              Appr: ₹{(loan.approvedAmount / 1000).toFixed(0)}K
                            </p>
                          )}
                        </td>
                        <td class="px-4 py-4">
                          {loan.agriScore
                            ? (
                              <span
                                class={`font-bold ${
                                  loan.agriScore >= 70
                                    ? "text-green-600"
                                    : loan.agriScore >= 50
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }`}
                              >
                                {loan.agriScore}
                              </span>
                            )
                            : <span class="text-gray-400">-</span>}
                        </td>
                        <td class="px-4 py-4">
                          {loan.riskCategory
                            ? (
                              <span
                                class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                                  loan.riskCategory === "low"
                                    ? "bg-green-100 text-green-700"
                                    : loan.riskCategory === "medium"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {loan.riskCategory}
                              </span>
                            )
                            : <span class="text-gray-400">-</span>}
                        </td>
                        <td class="px-4 py-4">
                          <span
                            class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                              statusColors[loan.status]
                            }`}
                          >
                            {loan.status.replace("_", " ")}
                          </span>
                        </td>
                        <td class="px-4 py-4 text-xs text-gray-500">
                          {new Date(loan.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td class="px-4 py-4">
                          <a
                            href={`/bank/assessment/${loan.id}`}
                            class="text-indigo-600 text-sm hover:underline"
                          >
                            {loan.status === "draft" ||
                                loan.status === "submitted"
                              ? "Assess"
                              : "View"}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              : (
                <div class="p-8 text-center">
                  <p class="text-gray-500 mb-4">No loan applications found</p>
                  <a
                    href="/bank/assessment/new"
                    class="text-indigo-600 hover:underline"
                  >
                    Create a new assessment
                  </a>
                </div>
              )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div class="mt-4 flex justify-center gap-2">
              {page > 1 && (
                <a
                  href={`/bank/assessments?page=${page - 1}${
                    status ? `&status=${status}` : ""
                  }`}
                  class="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Previous
                </a>
              )}
              <span class="px-4 py-2 text-gray-600">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <a
                  href={`/bank/assessments?page=${page + 1}${
                    status ? `&status=${status}` : ""
                  }`}
                  class="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Next
                </a>
              )}
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}
