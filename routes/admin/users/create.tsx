import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";
import { SUPPORTED_LANGUAGES } from "$utils/constants.ts";

interface CreateUserPageData {
  error?: string;
}

export const handler: Handlers<CreateUserPageData, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const allowedRoles = ["admin", "tenant_admin"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    return ctx.render({});
  },

  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, { status: 401 });
    }

    const allowedRoles = ["admin", "tenant_admin"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, { status: 403 });
    }

    const formData = await req.formData();
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const role = formData.get("role") as string;
    const language = formData.get("language") as string;

    if (!name || !phone || !role) {
      return ctx.render({ error: "All fields are required" });
    }

    // Validate phone
    if (!/^\d{10}$/.test(phone)) {
      return ctx.render({ error: "Phone must be 10 digits" });
    }

    // Check if user exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM users WHERE phone = $1`,
      [phone],
    );

    if (existing.length > 0) {
      return ctx.render({ error: "User with this phone already exists" });
    }

    // Create user
    try {
      await execute(
        `INSERT INTO users (id, tenant_id, name, phone, role, language, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true)`,
        [ctx.state.session.tenantId, name, phone, role, language || "en"],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/users?success=created" },
      });
    } catch (e) {
      console.error("Error creating user:", e);
      return ctx.render({ error: "Failed to create user" });
    }
  },
};

export default function CreateUserPage(
  { data }: PageProps<CreateUserPageData>,
) {
  const roles = [
    { id: "farmer", label: "Farmer", desc: "Regular farmer user" },
    {
      id: "extension_officer",
      label: "Extension Officer",
      desc: "Field support staff",
    },
    {
      id: "bank_officer",
      label: "Bank Officer",
      desc: "Loan and credit assessment",
    },
    { id: "tenant_admin", label: "Admin", desc: "Full administrative access" },
  ];

  return (
    <AdminLayout title="Create New User" currentPage="users">
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow p-6">
          {data.error && (
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {data.error}
            </div>
          )}

          <form method="POST" class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Enter full name"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                required
                pattern="[0-9]{10}"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="10 digit phone number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Role *
              </label>
              <div class="grid grid-cols-2 gap-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    class="flex flex-col p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.id}
                      required
                      class="sr-only"
                    />
                    <span class="font-medium text-gray-900">
                      {role.label}
                    </span>
                    <span class="text-xs text-gray-500">{role.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                name="language"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <div class="flex gap-3 pt-4">
              <a
                href="/admin/users"
                class="flex-1 py-2 border border-gray-300 rounded-lg text-center text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </a>
              <button
                type="submit"
                class="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
