import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, queryOne } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface UserDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  username: string;
  role: string;
  language: string;
  isActive: boolean;
  createdAt: string;
  farmCount: number;
}

interface PageData {
  user: UserDetail | null;
  success?: string;
  error?: string;
}

export const handler: Handlers<PageData, AuthState> = {
  async GET(_req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const userId = ctx.params.id;
    const tenantId = ctx.state.session.tenantId;

    const result = await queryOne<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      username: string;
      role: string;
      language: string;
      is_active: boolean;
      created_at: Date;
      farm_count: number;
    }>(
      `SELECT u.id, u.name, u.phone, u.email, u.username, u.role, u.language, u.is_active, u.created_at,
              COUNT(f.id)::int as farm_count
       FROM users u
       LEFT JOIN farms f ON f.farmer_id = u.id
       WHERE u.id = $1 AND u.tenant_id = $2
       GROUP BY u.id`,
      [userId, tenantId],
    );

    if (!result) {
      return ctx.render({ user: null });
    }

    return ctx.render({
      user: {
        id: result.id,
        name: result.name,
        phone: result.phone,
        email: result.email,
        username: result.username,
        role: result.role,
        language: result.language,
        isActive: result.is_active,
        createdAt: new Date(result.created_at).toLocaleDateString("en-IN"),
        farmCount: result.farm_count,
      },
    });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const userId = ctx.params.id;
    const tenantId = ctx.state.session.tenantId;
    const form = await req.formData();
    const action = form.get("action") as string;

    if (action === "update") {
      const name = form.get("name") as string;
      const email = form.get("email") as string;
      const role = form.get("role") as string;
      const language = form.get("language") as string;

      await execute(
        `UPDATE users SET name = $1, email = $2, role = $3, language = $4, updated_at = NOW()
         WHERE id = $5 AND tenant_id = $6`,
        [name, email || null, role, language, userId, tenantId],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/users/${userId}?success=updated` },
      });
    }

    if (action === "toggle_active") {
      await execute(
        `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [userId, tenantId],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/users/${userId}?success=toggled` },
      });
    }

    if (action === "reset_password") {
      const { hashPassword } = await import("$lib/auth.ts");
      const newHash = await hashPassword(
        form.get("username") as string || "compass123",
      );
      await execute(
        `UPDATE users SET password_hash = $1, force_password_change = true, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [newHash, userId, tenantId],
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/admin/users/${userId}?success=password_reset`,
        },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/users/${userId}` },
    });
  },
};

export default function AdminUserEdit({ data }: PageProps<PageData>) {
  const { user } = data;
  const url = new URL("http://x" + (globalThis?.location?.search || ""));
  const success = url.searchParams?.get("success");

  if (!user) {
    return (
      <AdminLayout title="User Not Found" currentPage="users">
        <div class="text-center py-20">
          <p class="text-gray-500 text-lg">User not found</p>
          <a href="/admin/users" class="text-primary-600 mt-4 inline-block">
            Back to Users
          </a>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`Edit: ${user.name}`} currentPage="users">
      <div class="max-w-3xl">
        {success === "updated" && (
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            User updated successfully.
          </div>
        )}
        {success === "toggled" && (
          <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            User status toggled.
          </div>
        )}
        {success === "password_reset" && (
          <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            Password reset. User must change it on next login.
          </div>
        )}

        {/* Status bar */}
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <span
              class={`px-2.5 py-1 text-xs font-medium rounded-full ${
                user.isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {user.isActive ? "Active" : "Inactive"}
            </span>
            <span class="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 capitalize">
              {user.role}
            </span>
            <span class="text-sm text-gray-500">
              {user.farmCount} farm{user.farmCount !== 1 ? "s" : ""}
            </span>
          </div>
          <span class="text-xs text-gray-400">
            Joined {user.createdAt}
          </span>
        </div>

        {/* Edit Form */}
        <form method="POST" class="bg-white rounded-xl shadow-sm border p-6">
          <input type="hidden" name="action" value="update" />
          <input type="hidden" name="username" value={user.username} />

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={user.name}
                required
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={user.email || ""}
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                name="role"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {["farmer", "extension_officer", "tenant_admin", "admin"].map(
                  (r) => (
                    <option key={r} value={r} selected={user.role === r}>
                      {r.replace("_", " ").replace(/\b\w/g, (c) =>
                        c.toUpperCase())}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                name="language"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {[
                  ["en", "English"],
                  ["hi", "Hindi"],
                  ["mr", "Marathi"],
                  ["ta", "Tamil"],
                  ["te", "Telugu"],
                  ["kn", "Kannada"],
                  ["bn", "Bengali"],
                  ["gu", "Gujarati"],
                  ["pa", "Punjabi"],
                  ["ml", "Malayalam"],
                  ["or", "Odia"],
                ].map(([code, name]) => (
                  <option
                    key={code}
                    value={code}
                    selected={user.language === code}
                  >
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t flex items-center gap-3">
            <button
              type="submit"
              class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              Save Changes
            </button>
            <span class="text-xs text-gray-400">
              Username: {user.username} | Phone: {user.phone}
            </span>
          </div>
        </form>

        {/* Actions */}
        <div class="mt-6 flex gap-3">
          <form method="POST">
            <input type="hidden" name="action" value="toggle_active" />
            <button
              type="submit"
              class={`px-4 py-2 rounded-lg text-sm font-medium border ${
                user.isActive
                  ? "border-red-300 text-red-600 hover:bg-red-50"
                  : "border-green-300 text-green-600 hover:bg-green-50"
              }`}
            >
              {user.isActive ? "Deactivate User" : "Activate User"}
            </button>
          </form>

          <form method="POST">
            <input type="hidden" name="action" value="reset_password" />
            <input type="hidden" name="username" value={user.username} />
            <button
              type="submit"
              class="px-4 py-2 rounded-lg text-sm font-medium border border-yellow-300 text-yellow-600 hover:bg-yellow-50"
            >
              Reset Password
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
