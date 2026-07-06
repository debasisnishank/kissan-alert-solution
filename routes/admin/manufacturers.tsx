import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ManufacturerData {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  productCount: number;
  isActive: boolean;
}

interface ManufacturersPageData {
  manufacturers: ManufacturerData[];
  showForm: boolean;
  error?: string;
}

export const handler: Handlers<ManufacturersPageData, AuthState> = {
  async GET(req, ctx) {
    if (
      !ctx.state.session ||
      (ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin")
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const showForm = url.searchParams.get("new") === "true";

    const manufacturers = await query<{
      id: string;
      name: string;
      contact_person: string;
      phone: string;
      email: string;
      address: string;
      is_active: boolean;
      product_count: number;
    }>(
      `SELECT m.id, m.name, m.contact_person, m.phone, m.email, m.address, m.is_active,
              COUNT(p.id)::int as product_count
       FROM manufacturers m
       LEFT JOIN agri_products p ON p.manufacturer = m.name
       GROUP BY m.id
       ORDER BY m.name ASC`,
      [],
    );

    return ctx.render({
      manufacturers: manufacturers.map((m) => ({
        id: m.id,
        name: m.name,
        contactPerson: m.contact_person || "",
        phone: m.phone || "",
        email: m.email || "",
        address: m.address || "",
        productCount: m.product_count,
        isActive: m.is_active,
      })),
      showForm,
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) return new Response(null, { status: 401 });

    const formData = await req.formData();
    const name = formData.get("name") as string;
    const contactPerson = formData.get("contact_person") as string;
    const phone = formData.get("phone") as string;
    const email = formData.get("email") as string;
    const address = formData.get("address") as string;

    if (!name) {
      const manufacturers = await query<{
        id: string;
        name: string;
        contact_person: string;
        phone: string;
        email: string;
        address: string;
        is_active: boolean;
        product_count: number;
      }>(
        `SELECT m.*, COUNT(p.id)::int as product_count FROM manufacturers m LEFT JOIN agri_products p ON p.manufacturer = m.name GROUP BY m.id ORDER BY m.name`,
        [],
      );
      return ctx.render({
        manufacturers: manufacturers.map((m) => ({
          id: m.id,
          name: m.name,
          contactPerson: m.contact_person || "",
          phone: m.phone || "",
          email: m.email || "",
          address: m.address || "",
          productCount: m.product_count,
          isActive: m.is_active,
        })),
        showForm: true,
        error: "Manufacturer name is required",
      });
    }

    try {
      await execute(
        `INSERT INTO manufacturers (id, name, contact_person, phone, email, address, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true)`,
        [name, contactPerson, phone, email, address],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/manufacturers?success=created" },
      });
    } catch (e) {
      console.error("Error creating manufacturer:", e);
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/manufacturers?error=failed" },
      });
    }
  },
};

export default function ManufacturersPage(
  { data }: PageProps<ManufacturersPageData>,
) {
  const { manufacturers, showForm, error } = data;

  return (
    <AdminLayout title="Manufacturers" currentPage="manufacturers">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">
            Manage fertilizer & agri product manufacturers
          </p>
          <a
            href="/admin/manufacturers?new=true"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            + Add Manufacturer
          </a>
        </div>
        {/* Add Form */}
        {showForm && (
          <div class="bg-white rounded-lg border p-6 mb-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Add New Manufacturer
            </h2>
            {error && (
              <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <form method="POST" class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  class="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., IFFCO"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  name="contact_person"
                  class="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  class="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  class="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  class="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div class="col-span-2 flex gap-3">
                <a
                  href="/admin/manufacturers"
                  class="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </a>
                <button
                  type="submit"
                  class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Manufacturer
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Manufacturers List */}
        <div class="bg-white rounded-lg border overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Company
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Contact
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phone
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Products
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {manufacturers.length > 0
                ? manufacturers.map((m) => (
                  <tr key={m.id} class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <p class="font-medium text-gray-900">{m.name}</p>
                      {m.email && <p class="text-xs text-gray-500">{m.email}
                      </p>}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600">
                      {m.contactPerson || "-"}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600">
                      {m.phone || "-"}
                    </td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {m.productCount} products
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class={`px-2 py-1 rounded text-xs font-medium ${
                          m.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
                : (
                  <tr>
                    <td
                      colSpan={5}
                      class="px-4 py-8 text-center text-gray-500"
                    >
                      No manufacturers yet.{" "}
                      <a
                        href="/admin/manufacturers?new=true"
                        class="text-primary-600"
                      >
                        Add one
                      </a>
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
