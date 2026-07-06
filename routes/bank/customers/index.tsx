import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { deleteBankCustomer, listBankCustomers } from "$lib/bank.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface Customer {
  id: string;
  name: string;
  phone: string;
  farmCount: number;
  totalArea: number;
  avgAgriScore: number;
  activeLoanAmount: number;
  kycStatus: string;
  createdAt: Date;
}

interface CustomersPageData {
  customers: Customer[];
  total: number;
  page: number;
  search: string;
  success?: string;
}

export const handler: Handlers<CustomersPageData, AuthState> = {
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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const search = url.searchParams.get("q") || "";
    const success = url.searchParams.get("success") || undefined;

    const tenantId = ctx.state.session.tenantId;
    const bankOfficerId = ctx.state.session.role === "bank_officer"
      ? ctx.state.session.userId
      : undefined;

    const limit = 20;
    const offset = (page - 1) * limit;

    const { customers: bankCustomers, total } = await listBankCustomers(
      tenantId,
      {
        bankOfficerId,
        search: search || undefined,
        limit,
        offset,
      },
    );

    const customers: Customer[] = bankCustomers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      farmCount: c.farmCount || 0,
      totalArea: c.totalArea || 0,
      avgAgriScore: c.avgAgriScore || 60,
      activeLoanAmount: c.activeLoanAmount || 0,
      kycStatus: c.kycStatus,
      createdAt: c.createdAt,
    }));

    return ctx.render({
      customers,
      total,
      page,
      search,
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
    const formData = await req.formData();
    const action = formData.get("action") as string;

    if (action === "delete") {
      const customerId = formData.get("customerId") as string;
      await deleteBankCustomer(customerId, tenantId);
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/customers?success=Customer removed" },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/bank/customers" },
    });
  },
};

export default function BankCustomersPage(
  { data }: PageProps<CustomersPageData>,
) {
  const { customers, total, page, search, success } = data;
  const totalPages = Math.ceil(total / 20);

  return (
    <Layout title="Customers - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a href="/bank" class="text-gray-500 hover:text-gray-700">
                ← Back
              </a>
              <div>
                <h1 class="text-xl font-bold text-gray-900">
                  Customer Management
                </h1>
                <p class="text-sm text-gray-500">{total} total customers</p>
              </div>
            </div>
            <a
              href="/bank/customers/search"
              class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              + Search / Add Customer
            </a>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-6 py-6">
          {success && (
            <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {success}
            </div>
          )}

          {/* Search */}
          <form class="mb-6">
            <div class="flex gap-2">
              <input
                type="text"
                name="q"
                value={search}
                placeholder="Search by name or phone..."
                class="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                class="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200"
              >
                Search
              </button>
              {search && (
                <a
                  href="/bank/customers"
                  class="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Clear
                </a>
              )}
            </div>
          </form>

          {/* Customers Table */}
          <div class="bg-white rounded-xl border overflow-hidden">
            {customers.length > 0
              ? (
                <table class="w-full">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Customer
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Contact
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Farms
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Total Area
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Agri Score
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Loan Status
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        KYC
                      </th>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    {customers.map((c) => (
                      <tr key={c.id} class="hover:bg-gray-50">
                        <td class="px-4 py-4">
                          <p class="font-medium text-gray-900">{c.name}</p>
                          <p class="text-xs text-gray-500">
                            Added{" "}
                            {new Date(c.createdAt).toLocaleDateString("en-IN")}
                          </p>
                        </td>
                        <td class="px-4 py-4 text-sm text-gray-600">
                          {c.phone}
                        </td>
                        <td class="px-4 py-4 text-sm text-gray-900">
                          {c.farmCount}
                        </td>
                        <td class="px-4 py-4 text-sm text-gray-900">
                          {c.totalArea.toFixed(1)} ha
                        </td>
                        <td class="px-4 py-4">
                          <span
                            class={`px-2 py-1 rounded text-sm font-bold ${
                              c.avgAgriScore >= 70
                                ? "bg-green-100 text-green-700"
                                : c.avgAgriScore >= 50
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {c.avgAgriScore}
                          </span>
                        </td>
                        <td class="px-4 py-4">
                          {c.activeLoanAmount > 0
                            ? (
                              <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                Active: ₹{(c.activeLoanAmount / 1000).toFixed(
                                  0,
                                )}
                                K
                              </span>
                            )
                            : (
                              <span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                No Active Loan
                              </span>
                            )}
                        </td>
                        <td class="px-4 py-4">
                          <span
                            class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                              c.kycStatus === "verified"
                                ? "bg-green-100 text-green-700"
                                : c.kycStatus === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {c.kycStatus}
                          </span>
                        </td>
                        <td class="px-4 py-4">
                          <div class="flex gap-2">
                            <a
                              href={`/bank/customers/${c.id}`}
                              class="text-indigo-600 text-sm hover:underline"
                            >
                              View
                            </a>
                            <a
                              href={`/bank/assessment/new?customerId=${c.id}`}
                              class="text-green-600 text-sm hover:underline"
                            >
                              Assess
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              : (
                <div class="p-8 text-center">
                  <p class="text-gray-500 mb-4">No customers found</p>
                  <a
                    href="/bank/customers/search"
                    class="text-indigo-600 hover:underline"
                  >
                    Search or add a new customer
                  </a>
                </div>
              )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div class="mt-4 flex justify-center gap-2">
              {page > 1 && (
                <a
                  href={`/bank/customers?page=${page - 1}${
                    search ? `&q=${search}` : ""
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
                  href={`/bank/customers?page=${page + 1}${
                    search ? `&q=${search}` : ""
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
