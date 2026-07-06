import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import {
  createBankCustomer,
  getBankCustomerByUserId,
  searchUserByPhone,
} from "$lib/bank.ts";
import { createUser } from "$lib/auth.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface SearchPageData {
  searchResult: {
    found: boolean;
    user?: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      role: string;
      isCustomer: boolean;
    };
    customerId?: string;
    message?: string;
  } | null;
  searchedPhone: string;
  error?: string;
  success?: string;
}

export const handler: Handlers<SearchPageData, AuthState> = {
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
    const phone = url.searchParams.get("phone") || "";
    const success = url.searchParams.get("success") || undefined;

    let searchResult: SearchPageData["searchResult"] = null;

    if (phone.length >= 10) {
      const tenantId = ctx.state.session.tenantId;
      const user = await searchUserByPhone(phone, tenantId);

      if (user) {
        let customerId: string | undefined;
        if (user.isCustomer) {
          const customer = await getBankCustomerByUserId(user.id, tenantId);
          customerId = customer?.id;
        }
        searchResult = {
          found: true,
          user,
          customerId,
        };
      } else {
        searchResult = {
          found: false,
          message: "No user found with this phone number",
        };
      }
    }

    return ctx.render({ searchResult, searchedPhone: phone, success });
  },

  async POST(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const bankOfficerId = ctx.state.session.userId;
    const formData = await req.formData();
    const action = formData.get("action") as string;

    if (action === "add_existing") {
      // Add existing user as bank customer
      const userId = formData.get("userId") as string;
      const notes = formData.get("notes") as string;

      const customer = await createBankCustomer({
        tenantId,
        userId,
        bankOfficerId,
        notes,
      });

      if (customer) {
        return new Response(null, {
          status: 302,
          headers: {
            Location:
              `/bank/customers/${customer.id}?success=Customer added successfully`,
          },
        });
      }

      return ctx.render({
        searchResult: null,
        searchedPhone: "",
        error: "Failed to add customer",
      });
    }

    if (action === "create_new") {
      // Create new user and add as bank customer
      const phone = formData.get("phone") as string;
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const village = formData.get("village") as string;
      const district = formData.get("district") as string;
      const notes = formData.get("notes") as string;

      try {
        // Create user
        const user = await createUser({
          tenantId,
          phone,
          name,
          email: email || undefined,
          role: "farmer",
          language: "hi",
        });

        if (!user) {
          return ctx.render({
            searchResult: { found: false, message: "User already exists" },
            searchedPhone: phone,
            error: "Failed to create user - phone number may already exist",
          });
        }

        // Create bank customer
        const customer = await createBankCustomer({
          tenantId,
          userId: user.id,
          bankOfficerId,
          notes: notes ||
            `Address: ${village || ""}${district ? ", " + district : ""}`,
        });

        if (customer) {
          return new Response(null, {
            status: 302,
            headers: {
              Location:
                `/bank/customers/${customer.id}?success=New customer created successfully`,
            },
          });
        }
      } catch {
        return ctx.render({
          searchResult: { found: false },
          searchedPhone: phone,
          error: "Failed to create customer",
        });
      }
    }

    return ctx.render({
      searchResult: null,
      searchedPhone: "",
      error: "Invalid action",
    });
  },
};

export default function CustomerSearchPage(
  { data }: PageProps<SearchPageData>,
) {
  const { searchResult, searchedPhone, error, success } = data;

  return (
    <Layout title="Search / Add Customer - Bank Portal">
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-3xl mx-auto px-6 py-4">
            <a
              href="/bank/customers"
              class="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Back to Customers
            </a>
            <h1 class="text-xl font-bold text-gray-900 mt-2">
              Search or Add Customer
            </h1>
            <p class="text-sm text-gray-500">
              Search by phone number to find existing users or create new ones
            </p>
          </div>
        </header>

        <main class="max-w-3xl mx-auto px-6 py-6">
          {error && (
            <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {success}
            </div>
          )}

          {/* Search Form */}
          <div class="bg-white rounded-xl border p-6 mb-6">
            <h2 class="font-semibold text-gray-900 mb-4">
              Search by Phone Number
            </h2>
            <form method="GET" class="flex gap-2">
              <input
                type="tel"
                name="phone"
                value={searchedPhone}
                placeholder="Enter 10-digit phone number"
                pattern="[0-9]{10}"
                maxLength={10}
                class="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg"
                required
              />
              <button
                type="submit"
                class="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
              >
                Search
              </button>
            </form>
          </div>

          {/* Search Results */}
          {searchResult && (
            <div class="bg-white rounded-xl border p-6">
              {searchResult.found && searchResult.user
                ? (
                  <div>
                    <div class="flex items-center gap-4 mb-6">
                      <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span class="text-2xl font-bold text-indigo-600">
                          {searchResult.user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h3 class="text-xl font-bold text-gray-900">
                          {searchResult.user.name}
                        </h3>
                        <p class="text-gray-600">{searchResult.user.phone}</p>
                        {searchResult.user.email && (
                          <p class="text-sm text-gray-500">
                            {searchResult.user.email}
                          </p>
                        )}
                        <span class="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
                          {searchResult.user.role}
                        </span>
                      </div>
                    </div>

                    {searchResult.user.isCustomer
                      ? (
                        <div class="p-4 bg-green-50 rounded-lg mb-4">
                          <p class="text-green-700 font-medium">
                            ✓ This user is already a bank customer
                          </p>
                          <a
                            href={`/bank/customers/${searchResult.customerId}`}
                            class="text-green-600 text-sm hover:underline"
                          >
                            View customer profile →
                          </a>
                        </div>
                      )
                      : (
                        <form method="POST">
                          <input
                            type="hidden"
                            name="action"
                            value="add_existing"
                          />
                          <input
                            type="hidden"
                            name="userId"
                            value={searchResult.user.id}
                          />

                          <div class="p-4 bg-blue-50 rounded-lg mb-4">
                            <p class="text-blue-700">
                              This user is registered but not yet a bank
                              customer.
                            </p>
                          </div>

                          <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                              Notes (optional)
                            </label>
                            <textarea
                              name="notes"
                              rows={2}
                              class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                              placeholder="Add any notes about this customer..."
                            />
                          </div>

                          <button
                            type="submit"
                            class="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                          >
                            Add as Bank Customer
                          </button>
                        </form>
                      )}
                  </div>
                )
                : (
                  <div>
                    <div class="p-4 bg-yellow-50 rounded-lg mb-6">
                      <p class="text-yellow-700 font-medium">
                        No user found with phone: {searchedPhone}
                      </p>
                      <p class="text-yellow-600 text-sm">
                        You can create a new customer below.
                      </p>
                    </div>

                    <h3 class="font-semibold text-gray-900 mb-4">
                      Create New Customer
                    </h3>
                    <form method="POST" class="space-y-4">
                      <input type="hidden" name="action" value="create_new" />
                      <input
                        type="hidden"
                        name="phone"
                        value={searchedPhone}
                      />

                      <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={searchedPhone}
                            class="w-full px-4 py-2 border rounded-lg bg-gray-50"
                            disabled
                          />
                        </div>

                        <div class="col-span-2">
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            name="name"
                            required
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Enter full name"
                          />
                        </div>

                        <div class="col-span-2">
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            Email (optional)
                          </label>
                          <input
                            type="email"
                            name="email"
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="email@example.com"
                          />
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            Village
                          </label>
                          <input
                            type="text"
                            name="village"
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Village name"
                          />
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            District
                          </label>
                          <input
                            type="text"
                            name="district"
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="District name"
                          />
                        </div>

                        <div class="col-span-2">
                          <label class="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                          </label>
                          <textarea
                            name="notes"
                            rows={2}
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Additional notes..."
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        class="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                      >
                        Create New Customer
                      </button>
                    </form>
                  </div>
                )}
            </div>
          )}

          {/* Instructions */}
          {!searchResult && (
            <div class="bg-gray-100 rounded-xl p-6 text-gray-600">
              <h3 class="font-medium text-gray-900 mb-2">How it works:</h3>
              <ol class="list-decimal list-inside space-y-1 text-sm">
                <li>Enter the customer's 10-digit phone number</li>
                <li>
                  If the user exists, you can add them as a bank customer
                </li>
                <li>If not found, you can create a new user and customer</li>
                <li>Once added, you can create loan assessments for them</li>
              </ol>
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}
