import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";
import { sendPushNotification, sendToAllUsers } from "$lib/notifications.ts";

interface NotificationLog {
  id: string;
  title: string;
  body: string;
  targetType: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  createdBy: string;
}

interface NotifPageData {
  stats: {
    totalTokens: number;
    androidTokens: number;
    iosTokens: number;
    totalSent: number;
  };
  recentLogs: NotificationLog[];
  userCount: number;
  success?: string;
  error?: string;
  result?: { sent: number; failed: number; targeted: number };
}

export const handler: Handlers<NotifPageData, AuthState> = {
  async GET(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const url = new URL(req.url);

    const [tokenStats, userCount, recentLogs] = await Promise.all([
      queryOne<{
        total: number;
        android: number;
        ios: number;
      }>(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE platform = 'android')::int as android,
           COUNT(*) FILTER (WHERE platform = 'ios')::int as ios
         FROM push_tokens pt
         JOIN users u ON pt.user_id = u.id
         WHERE u.tenant_id = $1`,
        [tenantId],
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT u.id)::int as count
         FROM users u JOIN push_tokens pt ON pt.user_id = u.id
         WHERE u.tenant_id = $1 AND u.is_active = true`,
        [tenantId],
      ),
      query<{
        id: string;
        action: string;
        details: string;
        created_at: Date;
        user_name: string;
      }>(
        `SELECT al.id, al.action, al.after_data::text as details, al.created_at,
                COALESCE(u.name, 'System') as user_name
         FROM audit_log al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.tenant_id = $1 AND al.action = 'send_notification'
         ORDER BY al.created_at DESC LIMIT 20`,
        [tenantId],
      ),
    ]);

    const logs: NotificationLog[] = recentLogs.map((l) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(l.details || "{}");
      } catch { /* ignore */ }
      return {
        id: l.id,
        title: (parsed.title as string) || "Notification",
        body: (parsed.body as string) || "",
        targetType: (parsed.targetType as string) || "all",
        targetCount: Number(parsed.targeted || 0),
        sentCount: Number(parsed.sent || 0),
        failedCount: Number(parsed.failed || 0),
        createdAt: new Date(l.created_at).toLocaleString("en-IN"),
        createdBy: l.user_name,
      };
    });

    return ctx.render({
      stats: {
        totalTokens: tokenStats?.total || 0,
        androidTokens: tokenStats?.android || 0,
        iosTokens: tokenStats?.ios || 0,
        totalSent: logs.reduce((s, l) => s + l.sentCount, 0),
      },
      recentLogs: logs,
      userCount: userCount?.count || 0,
      success: url.searchParams.get("success") || undefined,
      error: url.searchParams.get("error") || undefined,
    });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, { status: 403 });
    }

    const tenantId = ctx.state.session.tenantId;
    const userId = ctx.state.session.userId;
    const form = await req.formData();
    const action = form.get("action") as string;

    if (action === "send") {
      const title = (form.get("title") as string || "").trim();
      const body = (form.get("body") as string || "").trim();
      const targetType = form.get("target_type") as string || "all";
      const targetUserId = form.get("target_user_id") as string;
      const channel = form.get("channel") as string || "default";
      const icon = form.get("icon") as string || "ic_notification";
      const sound = form.get("sound") as string || "default";
      const imageUrl = (form.get("image_url") as string || "").trim();
      const screen = form.get("screen") as string || "";
      const screenParams = (form.get("screen_params") as string || "").trim();

      if (!title || !body) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/admin/notifications?error=Title and body are required",
          },
        });
      }

      const data: Record<string, string> = {
        channel,
        icon,
        sound,
      };
      if (imageUrl) data.imageUrl = imageUrl;
      if (screen) data.screen = screen;
      if (screenParams) data.params = screenParams;

      let result = { sent: 0, failed: 0, targeted: 0 };

      try {
        if (targetType === "user" && targetUserId) {
          const r = await sendPushNotification(
            targetUserId,
            title,
            body,
            data,
          );
          result = { ...r, targeted: 1 };
        } else if (targetType === "farmers") {
          result = await sendToAllUsers(
            tenantId,
            title,
            body,
            data,
            "farmer",
          );
        } else {
          result = await sendToAllUsers(tenantId, title, body, data);
        }

        // Log to audit
        try {
          await execute(
            `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, after_data, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'send_notification', 'notification', $3, NOW())`,
            [
              tenantId,
              userId,
              JSON.stringify({
                title,
                body,
                targetType,
                imageUrl: imageUrl || undefined,
                channel,
                ...result,
              }),
            ],
          );
        } catch { /* audit log failure is non-critical */ }

        return new Response(null, {
          status: 302,
          headers: {
            Location:
              `/admin/notifications?success=Sent to ${result.sent} devices (${result.failed} failed, ${result.targeted} users targeted)`,
          },
        });
      } catch (err) {
        console.error("Notification send error:", err);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/admin/notifications?error=${
              encodeURIComponent(String(err))
            }`,
          },
        });
      }
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/notifications" },
    });
  },
};

const ICONS = [
  ["ic_notification", "Default Bell"],
  ["ic_stat_compass", "Khetscope"],
  ["ic_weather", "Weather"],
  ["ic_alert", "Alert"],
  ["ic_crop", "Crop"],
  ["ic_market", "Market"],
];

const CHANNELS = [
  ["default", "Default"],
  ["alerts", "Farm Alerts (High Priority)"],
  ["weather", "Weather Updates"],
];

const SOUNDS = [
  ["default", "Default"],
  ["alert_tone", "Alert Tone"],
  ["chime", "Chime"],
  ["none", "Silent"],
];

const SCREENS = [
  ["", "None (just open app)"],
  ["Alerts", "Alerts Screen"],
  ["Reels", "Video Reels"],
  ["FarmDetail", "Farm Detail (needs farmId param)"],
  ["Chat", "AI Chat"],
  ["CropScan", "Crop Scanner"],
];

export default function NotificationsPage(
  { data }: PageProps<NotifPageData>,
) {
  const { stats, recentLogs, userCount, success, error } = data;

  return (
    <AdminLayout title="Notifications" currentPage="notifications">
      {success && (
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white rounded-xl p-4 border">
          <div class="text-2xl font-bold text-gray-900">
            {stats.totalTokens}
          </div>
          <div class="text-xs text-gray-500 mt-1">Registered Devices</div>
        </div>
        <div class="bg-green-50 rounded-xl p-4 border border-green-200">
          <div class="text-2xl font-bold text-green-700">{userCount}</div>
          <div class="text-xs text-green-600 mt-1">Reachable Users</div>
        </div>
        <div class="bg-white rounded-xl p-4 border">
          <div class="text-2xl font-bold text-gray-900">
            {stats.androidTokens}
          </div>
          <div class="text-xs text-gray-500 mt-1">Android</div>
        </div>
        <div class="bg-white rounded-xl p-4 border">
          <div class="text-2xl font-bold text-gray-900">
            {stats.iosTokens}
          </div>
          <div class="text-xs text-gray-500 mt-1">iOS</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose Form */}
        <div class="lg:col-span-2">
          <div class="bg-white rounded-xl shadow-sm border p-6">
            <h2 class="text-sm font-semibold text-gray-900 mb-4">
              Compose Notification
            </h2>

            <form method="POST" class="space-y-4">
              <input type="hidden" name="action" value="send" />

              {/* Title */}
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  maxLength={100}
                  placeholder="e.g. Weather Alert for Your Farm"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Body */}
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">
                  Message *
                </label>
                <textarea
                  name="body"
                  required
                  rows={3}
                  maxLength={1000}
                  placeholder="Write notification message..."
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p class="text-xs text-gray-400 mt-1">
                  Messages over 100 chars auto-expand on Android
                </p>
              </div>

              {/* Expandable Image */}
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">
                  Expandable Image URL
                  <span class="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <input
                  type="url"
                  name="image_url"
                  placeholder="https://example.com/image.jpg"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p class="text-xs text-gray-400 mt-1">
                  Shows as big picture when notification is expanded. Use a
                  public URL.
                </p>
              </div>

              {/* Target + Channel row */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Target Audience *
                  </label>
                  <select
                    name="target_type"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="all">
                      All Users ({userCount} reachable)
                    </option>
                    <option value="farmers">Farmers Only</option>
                    <option value="user">Specific User (enter ID below)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Channel (Priority)
                  </label>
                  <select
                    name="channel"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {CHANNELS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specific user ID */}
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">
                  User ID
                  <span class="text-gray-400 font-normal ml-1">
                    (only when targeting specific user)
                  </span>
                </label>
                <input
                  type="text"
                  name="target_user_id"
                  placeholder="UUID of the target user"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Icon + Sound row */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Notification Icon
                  </label>
                  <select
                    name="icon"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {ICONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Notification Tone
                  </label>
                  <select
                    name="sound"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {SOUNDS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Deep Link */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    On-Tap Screen
                    <span class="text-gray-400 font-normal ml-1">
                      (optional deep link)
                    </span>
                  </label>
                  <select
                    name="screen"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {SCREENS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">
                    Screen Params (JSON)
                    <span class="text-gray-400 font-normal ml-1">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    name="screen_params"
                    placeholder='{"farmId": "uuid-here"}'
                    class="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Preview + Send */}
              <div class="pt-4 border-t flex items-center justify-between">
                <p class="text-xs text-gray-400">
                  Notifications are sent immediately via Firebase Cloud
                  Messaging
                </p>
                <button
                  type="submit"
                  class="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                >
                  Send Notification
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Send Guide */}
        <div>
          <div class="bg-white rounded-xl shadow-sm border p-5 mb-4">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">
              Quick Guide
            </h3>
            <div class="space-y-3 text-xs text-gray-600">
              <div>
                <div class="font-medium text-gray-800">Required fields:</div>
                <p>
                  Title and Message are required. Everything else is optional
                  with sensible defaults.
                </p>
              </div>
              <div>
                <div class="font-medium text-gray-800">Expandable Image:</div>
                <p>
                  Paste a public image URL. On Android, it shows as a big
                  picture when expanded. On iOS, it shows as an attachment.
                </p>
              </div>
              <div>
                <div class="font-medium text-gray-800">Deep Links:</div>
                <p>
                  Select "On-Tap Screen" to navigate users to a specific screen
                  when they tap the notification. For FarmDetail, provide{" "}
                  <code class="bg-gray-100 px-1 rounded">
                    {`{"farmId":"uuid"}`}
                  </code>{" "}
                  in params.
                </p>
              </div>
              <div>
                <div class="font-medium text-gray-800">Channels:</div>
                <p>
                  "Farm Alerts" triggers high-priority with sound. "Weather" is
                  default priority. Users can control these in device settings.
                </p>
              </div>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">
              Preview
            </h3>
            <div class="bg-white rounded-lg shadow p-3 border">
              <div class="flex items-start gap-2">
                <div class="w-6 h-6 bg-green-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    class="w-3.5 h-3.5 text-green-600"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-gray-900">
                    Khetscope
                  </div>
                  <div class="text-xs font-medium text-gray-800 mt-0.5">
                    Your title appears here
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5">
                    Your message body text...
                  </div>
                  <div class="mt-2 bg-gray-100 rounded h-20 flex items-center justify-center text-xs text-gray-400">
                    Expandable image area
                  </div>
                </div>
              </div>
            </div>
            <p class="text-[10px] text-gray-400 mt-2 text-center">
              Actual appearance varies by device
            </p>
          </div>
        </div>
      </div>

      {/* Recent Sends */}
      <div class="mt-6 bg-white rounded-xl shadow-sm border overflow-hidden">
        <div class="px-4 py-3 border-b bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">
            Recent Notification Sends
          </h3>
        </div>
        <table class="w-full text-sm">
          <thead class="border-b">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">
                Title
              </th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">
                Target
              </th>
              <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">
                Sent
              </th>
              <th class="px-4 py-2 text-center text-xs font-medium text-gray-500">
                Failed
              </th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">
                By
              </th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">
                When
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {recentLogs.map((log) => (
              <tr key={log.id} class="hover:bg-gray-50">
                <td class="px-4 py-2">
                  <div class="font-medium text-gray-900">{log.title}</div>
                  <div class="text-xs text-gray-400 line-clamp-1">
                    {log.body}
                  </div>
                </td>
                <td class="px-4 py-2 text-xs text-gray-600 capitalize">
                  {log.targetType}
                  <span class="text-gray-400 ml-1">
                    ({log.targetCount} users)
                  </span>
                </td>
                <td class="px-4 py-2 text-center text-green-600 font-medium">
                  {log.sentCount}
                </td>
                <td class="px-4 py-2 text-center text-red-500">
                  {log.failedCount}
                </td>
                <td class="px-4 py-2 text-xs text-gray-500">
                  {log.createdBy}
                </td>
                <td class="px-4 py-2 text-xs text-gray-400">
                  {log.createdAt}
                </td>
              </tr>
            ))}
            {recentLogs.length === 0 && (
              <tr>
                <td colspan={6} class="px-4 py-8 text-center text-gray-400">
                  No notifications sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
