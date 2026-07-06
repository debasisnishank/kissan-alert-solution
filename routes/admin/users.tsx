import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface UserData {
  id: string;
  name: string;
  phone: string;
  role: string;
  language: string;
  isActive: boolean;
  farmCount: number;
  createdAt: string;
}

interface AdminUsersPageData {
  users: UserData[];
  total: number;
  page: number;
  limit: number;
  roleFilter: string;
}

export const handler: Handlers<AdminUsersPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const allowedRoles = ["admin", "tenant_admin"];
    if (!allowedRoles.includes(session.role)) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const roleFilter = url.searchParams.get("role") || "all";
    const limit = 20;
    const offset = (page - 1) * limit;
    const tenantId = session.tenantId;

    let whereClause = "u.tenant_id = $1";
    const params: unknown[] = [tenantId];

    if (roleFilter !== "all") {
      params.push(roleFilter);
      whereClause += ` AND u.role = $${params.length}`;
    }

    const [users, countResult] = await Promise.all([
      query<{
        id: string;
        name: string;
        phone: string;
        role: string;
        language: string;
        is_active: boolean;
        farm_count: number;
        created_at: Date;
      }>(
        `SELECT 
          u.id, u.name, u.phone, u.role, u.language, u.is_active, u.created_at,
          COUNT(f.id)::int as farm_count
         FROM users u
         LEFT JOIN farms f ON f.farmer_id = u.id
         WHERE ${whereClause}
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) as count FROM users u WHERE ${whereClause}`,
        params,
      ),
    ]);

    return ctx.render({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        language: u.language,
        isActive: u.is_active,
        farmCount: u.farm_count,
        createdAt: new Date(u.created_at).toLocaleDateString("en-IN"),
      })),
      total: Number(countResult[0]?.count || 0),
      page,
      limit,
      roleFilter,
    });
  },
};

export default function AdminUsersPage(
  { data }: PageProps<AdminUsersPageData>,
) {
  const { users, total, page, limit, roleFilter } = data;
  const totalPages = Math.ceil(total / limit);

  const roles = [
    { id: "all", label: "All Roles" },
    { id: "farmer", label: "Farmers" },
    { id: "extension_officer", label: "Extension Officers" },
    { id: "bank_officer", label: "Bank Officers" },
    { id: "tenant_admin", label: "Admins" },
  ];

  const roleColors: Record<string, string> = {
    farmer: "bg-green-100 text-green-800",
    extension_officer: "bg-blue-100 text-blue-800",
    bank_officer: "bg-indigo-100 text-indigo-800",
    tenant_admin: "bg-purple-100 text-purple-800",
    admin: "bg-red-100 text-red-800",
    researcher: "bg-orange-100 text-orange-800",
    service_provider: "bg-yellow-100 text-yellow-800",
  };

  return (
    <AdminLayout title="Users Management" currentPage="users">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-gray-500">{total} total users</span>
          <a
            href="/admin/users/create"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            + Create User
          </a>
        </div>
        {/* Role Filter */}
        <div class="mb-4 flex gap-2">
          {roles.map((r) => (
            <a
              key={r.id}
              href={`/admin/users?role=${r.id}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                roleFilter === r.id
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </a>
          ))}
        </div>

        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  User
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phone
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Language
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Farms
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Joined
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} class="hover:bg-gray-50">
                  <td class="px-6 py-4">
                    <p class="font-medium text-gray-900">{user.name}</p>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {user.phone}
                  </td>
                  <td class="px-6 py-4">
                    <span
                      class={`px-2 py-1 text-xs font-medium rounded-full capitalize ${
                        roleColors[user.role] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {user.role.replace("_", " ")}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500 uppercase">
                    {user.language}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900">
                    {user.farmCount}
                  </td>
                  <td class="px-6 py-4">
                    {user.isActive
                      ? (
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      )
                      : (
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {user.createdAt}
                  </td>
                  <td class="px-6 py-4">
                    <a
                      href={`/admin/users/${user.id}`}
                      class="text-primary-600 hover:underline text-sm"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p class="text-sm text-gray-500">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, total)} of {total}
              </p>
              <div class="flex gap-2">
                {page > 1 && (
                  <a
                    href={`/admin/users?role=${roleFilter}&page=${page - 1}`}
                    class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    Previous
                  </a>
                )}
                {page < totalPages && (
                  <a
                    href={`/admin/users?role=${roleFilter}&page=${page + 1}`}
                    class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
