import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface LogEntry {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  ipAddress: string;
}

interface LogsPageData {
  logs: LogEntry[];
  total: number;
  page: number;
  filter: string;
}

export const handler: Handlers<LogsPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || ctx.state.user?.role !== "admin") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const filter = url.searchParams.get("action") || "all";
    const limit = 50;
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params: unknown[] = [];

    if (filter !== "all") {
      params.push(filter);
      whereClause = `WHERE a.action LIKE $${params.length} || '%'`;
    }

    const [logs, countResult] = await Promise.all([
      query<{
        id: string;
        user_name: string;
        action: string;
        entity_type: string;
        entity_id: string;
        created_at: Date;
        ip_address: string;
      }>(
        `SELECT a.id, u.name as user_name, a.action, a.entity_type, a.entity_id, a.created_at, a.ip_address
         FROM audit_log a
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query<{ count: number }>(
        `SELECT COUNT(*) as count FROM audit_log a ${whereClause}`,
        params,
      ),
    ]);

    return ctx.render({
      logs: logs.map((l) => ({
        id: l.id,
        userName: l.user_name || "System",
        action: l.action,
        entityType: l.entity_type || "-",
        entityId: l.entity_id || "-",
        createdAt: new Date(l.created_at).toLocaleString("en-IN"),
        ipAddress: l.ip_address || "-",
      })),
      total: Number(countResult[0]?.count || 0),
      page,
      filter,
    });
  },
};

export default function AdminLogsPage({ data }: PageProps<LogsPageData>) {
  const { logs, total, page, filter } = data;
  const totalPages = Math.ceil(total / 50);

  const actionTypes = ["all", "login", "create", "update", "delete", "view"];

  const actionColors: Record<string, string> = {
    login: "bg-blue-100 text-blue-700",
    create: "bg-green-100 text-green-700",
    update: "bg-yellow-100 text-yellow-700",
    delete: "bg-red-100 text-red-700",
    view: "bg-gray-100 text-gray-700",
  };

  return (
    <AdminLayout title="Audit Logs" currentPage="logs">
      <div class="max-w-7xl mx-auto">
        <p class="text-sm text-gray-500 mb-4">{total} total entries</p>
        {/* Filters */}
        <div class="flex gap-2 mb-4">
          {actionTypes.map((a) => (
            <a
              key={a}
              href={`/admin/logs?action=${a}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                filter === a
                  ? "bg-primary-600 text-white"
                  : "bg-white border text-gray-700"
              }`}
            >
              {a}
            </a>
          ))}
        </div>

        {/* Logs Table */}
        <div class="bg-white rounded-lg border overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Time
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  User
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Entity
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {logs.length > 0
                ? logs.map((log) => (
                  <tr key={log.id} class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-500">
                      {log.createdAt}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">
                      {log.userName}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class={`px-2 py-1 rounded text-xs font-medium ${
                          actionColors[log.action.split("_")[0]] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600">
                      {log.entityType !== "-"
                        ? `${log.entityType} (${log.entityId.slice(0, 8)}...)`
                        : "-"}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-500 font-mono">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))
                : (
                  <tr>
                    <td
                      colSpan={5}
                      class="px-4 py-8 text-center text-gray-500"
                    >
                      No audit logs found
                    </td>
                  </tr>
                )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div class="px-4 py-3 border-t flex items-center justify-between">
              <p class="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div class="flex gap-2">
                {page > 1 && (
                  <a
                    href={`/admin/logs?action=${filter}&page=${page - 1}`}
                    class="px-3 py-1 border rounded text-sm"
                  >
                    Previous
                  </a>
                )}
                {page < totalPages && (
                  <a
                    href={`/admin/logs?action=${filter}&page=${page + 1}`}
                    class="px-3 py-1 border rounded text-sm"
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
