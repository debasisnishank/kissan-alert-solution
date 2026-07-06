import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import {
  getBankCustomerById,
  listLoans,
  updateBankCustomer,
} from "$lib/bank.ts";
import { getFarmsByFarmer } from "$lib/farm.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface CustomerDetailData {
  customer: {
    id: string;
    userId: string;
    name: string;
    phone: string;
    email: string | null;
    customerCode: string | null;
    kycStatus: string;
    creditScore: number | null;
    notes: string | null;
    farmCount: number;
    totalArea: number;
    avgAgriScore: number;
    activeLoanAmount: number;
    createdAt: Date;
  };
  farms: Array<{
    id: string;
    name: string;
    areaHectares: number;
    district: string | null;
    village: string | null;
    cropType: string | null;
    soilType: string | null;
  }>;
  loans: Array<{
    id: string;
    applicationNumber: string | null;
    loanType: string;
    requestedAmount: number;
    approvedAmount: number | null;
    status: string;
    agriScore: number | null;
    createdAt: Date;
  }>;
  success?: string;
  error?: string;
}

export const handler: Handlers<CustomerDetailData, AuthState> = {
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
    const customerId = ctx.params.id;

    const url = new URL(req.url);
    const success = url.searchParams.get("success") || undefined;

    const customer = await getBankCustomerById(customerId, tenantId);
    if (!customer) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/customers" },
      });
    }

    // Get customer's farms
    const farmsData = await getFarmsByFarmer(customer.userId, tenantId);
    const farms = farmsData.map((f) => ({
      id: f.id,
      name: f.name,
      areaHectares: f.areaHectares,
      district: f.district,
      village: f.village,
      cropType: null, // Would need to fetch active crop
      soilType: f.soilType,
    }));

    // Get customer's loans
    const { loans: loansData } = await listLoans(tenantId, {
      customerId,
      limit: 10,
    });
    const loans = loansData.map((l) => ({
      id: l.id,
      applicationNumber: l.applicationNumber,
      loanType: l.loanType,
      requestedAmount: l.requestedAmount,
      approvedAmount: l.approvedAmount,
      status: l.status,
      agriScore: l.agriScore,
      createdAt: l.createdAt,
    }));

    return ctx.render({
      customer: {
        id: customer.id,
        userId: customer.userId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        customerCode: customer.customerCode,
        kycStatus: customer.kycStatus,
        creditScore: customer.creditScore,
        notes: customer.notes,
        farmCount: customer.farmCount || 0,
        totalArea: customer.totalArea || 0,
        avgAgriScore: customer.avgAgriScore || 60,
        activeLoanAmount: customer.activeLoanAmount || 0,
        createdAt: customer.createdAt,
      },
      farms,
      loans,
      success,
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const customerId = ctx.params.id;
    const formData = await req.formData();
    const action = formData.get("action") as string;

    if (action === "update_kyc") {
      const kycStatus = formData.get("kycStatus") as string;
      await updateBankCustomer(customerId, tenantId, { kycStatus });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/customers/${customerId}?success=KYC status updated`,
        },
      });
    }

    if (action === "update_notes") {
      const notes = formData.get("notes") as string;
      await updateBankCustomer(customerId, tenantId, { notes });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/customers/${customerId}?success=Notes updated`,
        },
      });
    }

    if (action === "update_credit_score") {
      const creditScore = parseInt(
        formData.get("creditScore") as string,
        10,
      );
      await updateBankCustomer(customerId, tenantId, { creditScore });
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            `/bank/customers/${customerId}?success=Credit score updated`,
        },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/bank/customers/${customerId}` },
    });
  },
};

export default function CustomerDetailPage(
  { data }: PageProps<CustomerDetailData>,
) {
  const { customer, farms, loans, success } = data;

  const statusColors: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    submitted: "bg-yellow-100 text-yellow-700",
    under_review: "bg-blue-100 text-blue-700",
    rejected: "bg-red-100 text-red-700",
    disbursed: "bg-green-100 text-green-700",
    draft: "bg-gray-100 text-gray-700",
    closed: "bg-gray-100 text-gray-700",
  };

  return (
    <Layout title={`${customer.name} - Bank Portal`}>
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-5xl mx-auto px-6 py-4">
            <a
              href="/bank/customers"
              class="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Back to Customers
            </a>
          </div>
        </header>

        <main class="max-w-5xl mx-auto px-6 py-6">
          {success && (
            <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {success}
            </div>
          )}

          {/* Customer Header */}
          <div class="bg-white rounded-xl border p-6 mb-6">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-4">
                <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span class="text-2xl font-bold text-indigo-600">
                    {customer.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 class="text-2xl font-bold text-gray-900">
                    {customer.name}
                  </h1>
                  <p class="text-gray-600">{customer.phone}</p>
                  {customer.email && (
                    <p class="text-sm text-gray-500">{customer.email}</p>
                  )}
                  {customer.customerCode && (
                    <p class="text-xs text-gray-400 mt-1">
                      Code: {customer.customerCode}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={`/bank/assessment/new?customerId=${customer.id}`}
                class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                + New Loan Assessment
              </a>
            </div>

            {/* Stats */}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">
                  {customer.farmCount}
                </p>
                <p class="text-sm text-gray-500">Farms</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">
                  {customer.totalArea.toFixed(1)} ha
                </p>
                <p class="text-sm text-gray-500">Total Area</p>
              </div>
              <div class="text-center">
                <p
                  class={`text-2xl font-bold ${
                    customer.avgAgriScore >= 70
                      ? "text-green-600"
                      : customer.avgAgriScore >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {customer.avgAgriScore}
                </p>
                <p class="text-sm text-gray-500">Avg Agri Score</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-blue-600">
                  ₹{(customer.activeLoanAmount / 1000).toFixed(0)}K
                </p>
                <p class="text-sm text-gray-500">Active Loans</p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Farms & Loans */}
            <div class="lg:col-span-2 space-y-6">
              {/* Farms */}
              <div class="bg-white rounded-xl border p-6">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="font-semibold text-gray-900">
                    Farms ({farms.length})
                  </h2>
                </div>
                {farms.length > 0
                  ? (
                    <div class="space-y-3">
                      {farms.map((farm) => (
                        <div
                          key={farm.id}
                          class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p class="font-medium text-gray-900">{farm.name}</p>
                            <p class="text-sm text-gray-500">
                              {farm.village || "Unknown"},{" "}
                              {farm.district || "Unknown"}
                            </p>
                          </div>
                          <div class="text-right">
                            <p class="font-medium text-gray-900">
                              {farm.areaHectares.toFixed(2)} ha
                            </p>
                            {farm.soilType && (
                              <p class="text-xs text-gray-500 capitalize">
                                {farm.soilType.replace("_", " ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                  : (
                    <p class="text-gray-500 text-center py-4">
                      No farms registered yet
                    </p>
                  )}
              </div>

              {/* Loan History */}
              <div class="bg-white rounded-xl border p-6">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="font-semibold text-gray-900">
                    Loan History ({loans.length})
                  </h2>
                </div>
                {loans.length > 0
                  ? (
                    <div class="overflow-x-auto">
                      <table class="w-full">
                        <thead>
                          <tr class="text-left text-xs text-gray-500 uppercase border-b">
                            <th class="pb-2">Application</th>
                            <th class="pb-2">Type</th>
                            <th class="pb-2">Amount</th>
                            <th class="pb-2">Score</th>
                            <th class="pb-2">Status</th>
                            <th class="pb-2"></th>
                          </tr>
                        </thead>
                        <tbody class="divide-y">
                          {loans.map((loan) => (
                            <tr key={loan.id} class="hover:bg-gray-50">
                              <td class="py-3">
                                <p class="font-medium text-gray-900 text-sm">
                                  {loan.applicationNumber ||
                                    loan.id.slice(0, 8)}
                                </p>
                                <p class="text-xs text-gray-500">
                                  {new Date(loan.createdAt).toLocaleDateString(
                                    "en-IN",
                                  )}
                                </p>
                              </td>
                              <td class="py-3 text-sm text-gray-600 capitalize">
                                {loan.loanType.replace("_", " ")}
                              </td>
                              <td class="py-3 text-sm">
                                <p class="text-gray-900">
                                  ₹{(loan.requestedAmount / 1000).toFixed(0)}K
                                </p>
                                {loan.approvedAmount && (
                                  <p class="text-xs text-green-600">
                                    Approved: ₹{(loan.approvedAmount / 1000)
                                      .toFixed(0)}K
                                  </p>
                                )}
                              </td>
                              <td class="py-3">
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
                              <td class="py-3">
                                <span
                                  class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                                    statusColors[loan.status] ||
                                    "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {loan.status.replace("_", " ")}
                                </span>
                              </td>
                              <td class="py-3">
                                <a
                                  href={`/bank/assessment/${loan.id}`}
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
                    <p class="text-gray-500 text-center py-4">
                      No loan applications yet
                    </p>
                  )}
              </div>
            </div>

            {/* Right Column - Status & Actions */}
            <div class="space-y-6">
              {/* KYC Status */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">KYC Status</h3>
                <form method="POST">
                  <input type="hidden" name="action" value="update_kyc" />
                  <select
                    name="kycStatus"
                    class="w-full px-4 py-2 border rounded-lg mb-3"
                    value={customer.kycStatus}
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button
                    type="submit"
                    class="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Update KYC
                  </button>
                </form>
              </div>

              {/* Credit Score */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">
                  Credit Score (CIBIL)
                </h3>
                <form method="POST">
                  <input
                    type="hidden"
                    name="action"
                    value="update_credit_score"
                  />
                  <input
                    type="number"
                    name="creditScore"
                    value={customer.creditScore || ""}
                    placeholder="300-900"
                    min="300"
                    max="900"
                    class="w-full px-4 py-2 border rounded-lg mb-3"
                  />
                  <button
                    type="submit"
                    class="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Update Score
                  </button>
                </form>
                {customer.creditScore && (
                  <div class="mt-3 text-center">
                    <span
                      class={`text-2xl font-bold ${
                        customer.creditScore >= 750
                          ? "text-green-600"
                          : customer.creditScore >= 650
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {customer.creditScore}
                    </span>
                    <p class="text-xs text-gray-500">
                      {customer.creditScore >= 750
                        ? "Excellent"
                        : customer.creditScore >= 650
                        ? "Good"
                        : "Needs Improvement"}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Notes</h3>
                <form method="POST">
                  <input type="hidden" name="action" value="update_notes" />
                  <textarea
                    name="notes"
                    rows={4}
                    class="w-full px-4 py-2 border rounded-lg mb-3"
                    placeholder="Add notes about this customer..."
                  >
                    {customer.notes || ""}
                  </textarea>
                  <button
                    type="submit"
                    class="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Save Notes
                  </button>
                </form>
              </div>

              {/* Quick Actions */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div class="space-y-2">
                  <a
                    href={`/bank/customers/${customer.id}/add-farm`}
                    class="block w-full px-4 py-2 text-center border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50"
                  >
                    Add New Farm
                  </a>
                  <a
                    href={`/bank/assessment/new?customerId=${customer.id}`}
                    class="block w-full px-4 py-2 text-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Create Loan Assessment
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}
