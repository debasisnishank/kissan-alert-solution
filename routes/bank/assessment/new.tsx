import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import {
  createLoanApplication,
  getBankCustomerById,
  listBankCustomers,
} from "$lib/bank.ts";
import { getFarmsByFarmer } from "$lib/farm.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface NewAssessmentData {
  customers: Array<{
    id: string;
    name: string;
    phone: string;
  }>;
  selectedCustomer?: {
    id: string;
    name: string;
    phone: string;
  };
  farms: Array<{
    id: string;
    name: string;
    areaHectares: number;
    district: string | null;
  }>;
  error?: string;
}

export const handler: Handlers<NewAssessmentData, AuthState> = {
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
    const customerId = url.searchParams.get("customerId");

    // Get customer list
    const { customers: customersList } = await listBankCustomers(tenantId, {
      bankOfficerId,
      limit: 100,
    });

    const customers = customersList.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    }));

    let selectedCustomer:
      | { id: string; name: string; phone: string }
      | undefined;
    let farms: Array<{
      id: string;
      name: string;
      areaHectares: number;
      district: string | null;
    }> = [];

    if (customerId) {
      const customer = await getBankCustomerById(customerId, tenantId);
      if (customer) {
        selectedCustomer = {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
        };

        // Get customer's farms
        const farmsData = await getFarmsByFarmer(customer.userId, tenantId);
        farms = farmsData.map((f) => ({
          id: f.id,
          name: f.name,
          areaHectares: f.areaHectares,
          district: f.district,
        }));
      }
    }

    return ctx.render({ customers, selectedCustomer, farms });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const formData = await req.formData();

    const customerId = formData.get("customerId") as string;
    const farmId = formData.get("farmId") as string;
    const loanType = formData.get("loanType") as string;
    const loanPurpose = formData.get("loanPurpose") as string;
    const requestedAmount = parseFloat(
      formData.get("requestedAmount") as string,
    );
    const tenureMonths = parseInt(formData.get("tenureMonths") as string, 10);

    if (!customerId || !requestedAmount) {
      const { customers: customersList } = await listBankCustomers(tenantId, {
        limit: 100,
      });
      return ctx.render({
        customers: customersList.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        })),
        farms: [],
        error: "Please fill all required fields",
      });
    }

    const loan = await createLoanApplication({
      tenantId,
      customerId,
      farmId: farmId || undefined,
      loanType,
      loanPurpose: loanPurpose || undefined,
      requestedAmount,
      tenureMonths: tenureMonths || 12,
    });

    if (loan) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/bank/assessment/${loan.id}` },
      });
    }

    return ctx.render({
      customers: [],
      farms: [],
      error: "Failed to create loan application",
    });
  },
};

export default function NewAssessmentPage(
  { data }: PageProps<NewAssessmentData>,
) {
  const { customers, selectedCustomer, farms, error } = data;

  return (
    <Layout title="New Loan Assessment - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-3xl mx-auto px-6 py-4">
            <a href="/bank" class="text-gray-500 hover:text-gray-700 text-sm">
              ← Back to Dashboard
            </a>
            <h1 class="text-xl font-bold text-gray-900 mt-2">
              New Loan Assessment
            </h1>
            <p class="text-sm text-gray-500">
              Create a new loan application and assess eligibility
            </p>
          </div>
        </header>

        <main class="max-w-3xl mx-auto px-6 py-6">
          {error && (
            <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <form method="POST" class="bg-white rounded-xl border p-6 space-y-6">
            {/* Customer Selection */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Customer *
              </label>
              {selectedCustomer
                ? (
                  <div class="p-4 bg-indigo-50 rounded-lg flex items-center justify-between">
                    <div>
                      <p class="font-medium text-gray-900">
                        {selectedCustomer.name}
                      </p>
                      <p class="text-sm text-gray-600">
                        {selectedCustomer.phone}
                      </p>
                    </div>
                    <input
                      type="hidden"
                      name="customerId"
                      value={selectedCustomer.id}
                    />
                    <a
                      href="/bank/assessment/new"
                      class="text-indigo-600 text-sm hover:underline"
                    >
                      Change
                    </a>
                  </div>
                )
                : (
                  <div>
                    <select
                      name="customerId"
                      required
                      class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select a customer...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </option>
                      ))}
                    </select>
                    {customers.length === 0 && (
                      <p class="text-sm text-gray-500 mt-2">
                        No customers found.{" "}
                        <a
                          href="/bank/customers/search"
                          class="text-indigo-600 hover:underline"
                        >
                          Add a customer first
                        </a>
                      </p>
                    )}
                  </div>
                )}
            </div>

            {/* Farm Selection */}
            {farms.length > 0 && (
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Select Farm (for collateral assessment)
                </label>
                <select
                  name="farmId"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No specific farm</option>
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} - {f.areaHectares.toFixed(2)} ha
                      {f.district ? ` (${f.district})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Loan Type */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Loan Type *
              </label>
              <select
                name="loanType"
                required
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="crop_loan">Crop Loan (KCC)</option>
                <option value="term_loan">Agriculture Term Loan</option>
                <option value="equipment_loan">Equipment/Machinery Loan</option>
                <option value="dairy_loan">Dairy/Animal Husbandry Loan</option>
                <option value="irrigation_loan">
                  Irrigation/Borewell Loan
                </option>
                <option value="storage_loan">Warehouse/Storage Loan</option>
                <option value="land_development">Land Development Loan</option>
              </select>
            </div>

            {/* Loan Purpose */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Loan Purpose
              </label>
              <textarea
                name="loanPurpose"
                rows={2}
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Describe the purpose of the loan..."
              />
            </div>

            {/* Amount & Tenure */}
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Requested Amount (₹) *
                </label>
                <input
                  type="number"
                  name="requestedAmount"
                  required
                  min="10000"
                  step="1000"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="100000"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Tenure (months)
                </label>
                <select
                  name="tenureMonths"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="6">6 months</option>
                  <option value="12" selected>12 months (1 year)</option>
                  <option value="18">18 months</option>
                  <option value="24">24 months (2 years)</option>
                  <option value="36">36 months (3 years)</option>
                  <option value="60">60 months (5 years)</option>
                  <option value="84">84 months (7 years)</option>
                </select>
              </div>
            </div>

            {/* Submit */}
            <div class="pt-4 border-t">
              <button
                type="submit"
                class="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
              >
                Create Loan Application
              </button>
              <p class="text-xs text-gray-500 text-center mt-2">
                After creation, you can perform the Agri Score assessment
              </p>
            </div>
          </form>
        </main>
      </div>
    </Layout>
  );
}
