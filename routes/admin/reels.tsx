import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ReelItem {
  id: string;
  platform: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videoUrl: string;
  viewCount: number;
  likeCount: number;
  isShort: boolean;
  isActive: boolean;
  publishedAt: string;
  fetchedAt: string;
}

interface ReelsPageData {
  reels: ReelItem[];
  stats: {
    total: number;
    active: number;
    youtube: number;
    facebook: number;
    shorts: number;
    totalViews: number;
  };
  filter: string;
  page: number;
  totalPages: number;
  success?: string;
}

export const handler: Handlers<ReelsPageData, AuthState> = {
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

    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let whereClause = "";

    if (filter === "active") {
      whereClause = "WHERE is_active = true";
    } else if (filter === "inactive") {
      whereClause = "WHERE is_active = false";
    } else if (filter === "shorts") {
      whereClause = "WHERE is_short = true AND is_active = true";
    } else if (filter === "youtube") {
      whereClause = "WHERE platform = 'youtube' AND is_active = true";
    } else if (filter === "facebook") {
      whereClause = "WHERE platform = 'facebook' AND is_active = true";
    }

    const [reelsResult, statsResult, countResult] = await Promise.all([
      query<{
        id: string;
        platform: string;
        title: string;
        channel_name: string;
        thumbnail_url: string;
        video_url: string;
        view_count: bigint;
        like_count: bigint;
        is_short: boolean;
        is_active: boolean;
        published_at: Date;
        fetched_at: Date;
      }>(
        `SELECT id, platform, title, channel_name, thumbnail_url, video_url,
                view_count, like_count, is_short, is_active, published_at, fetched_at
         FROM video_sources ${whereClause}
         ORDER BY fetched_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        [],
      ),
      queryOne<{
        total: number;
        active: number;
        youtube: number;
        facebook: number;
        shorts: number;
        total_views: number;
      }>(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE is_active = true)::int as active,
           COUNT(*) FILTER (WHERE platform = 'youtube')::int as youtube,
           COUNT(*) FILTER (WHERE platform = 'facebook')::int as facebook,
           COUNT(*) FILTER (WHERE is_short = true)::int as shorts,
           (SELECT COUNT(*)::int FROM video_views) as total_views
         FROM video_sources`,
        [],
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM video_sources ${whereClause}`,
        [],
      ),
    ]);

    const totalCount = countResult?.count || 0;

    return ctx.render({
      reels: reelsResult.map((r) => ({
        id: r.id,
        platform: r.platform,
        title: r.title,
        channelName: r.channel_name,
        thumbnailUrl: r.thumbnail_url,
        videoUrl: r.video_url,
        viewCount: Number(r.view_count),
        likeCount: Number(r.like_count),
        isShort: r.is_short,
        isActive: r.is_active,
        publishedAt: new Date(r.published_at).toLocaleDateString("en-IN"),
        fetchedAt: new Date(r.fetched_at).toLocaleDateString("en-IN"),
      })),
      stats: {
        total: statsResult?.total || 0,
        active: statsResult?.active || 0,
        youtube: statsResult?.youtube || 0,
        facebook: statsResult?.facebook || 0,
        shorts: statsResult?.shorts || 0,
        totalViews: statsResult?.total_views || 0,
      },
      filter,
      page,
      totalPages: Math.ceil(totalCount / limit),
      success: url.searchParams.get("success") || undefined,
    });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      !["admin", "tenant_admin"].includes(ctx.state.session.role)
    ) {
      return new Response(null, { status: 403 });
    }

    const form = await req.formData();
    const action = form.get("action") as string;

    if (action === "toggle") {
      const id = form.get("id") as string;
      await execute(
        `UPDATE video_sources SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1`,
        [id],
      );
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/reels?success=toggled" },
      });
    }

    if (action === "delete") {
      const id = form.get("id") as string;
      await execute(`DELETE FROM video_views WHERE video_id = $1`, [id]);
      await execute(`DELETE FROM video_sources WHERE id = $1`, [id]);
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/reels?success=deleted" },
      });
    }

    if (action === "fetch_now") {
      try {
        const { env } = await import("$utils/env.ts");
        if (env.YOUTUBE_API_KEY) {
          const { fetchYouTubeVideos } = await import(
            "$lib/videos/youtube.ts"
          );
          await fetchYouTubeVideos(env.YOUTUBE_API_KEY);
        }
      } catch (err) {
        console.error("Manual fetch error:", err);
      }
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/reels?success=fetched" },
      });
    }

    if (action === "deactivate_all") {
      await execute(
        `UPDATE video_sources SET is_active = false, updated_at = NOW()`,
        [],
      );
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/reels?success=deactivated_all" },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/reels" },
    });
  },
};

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export default function AdminReels({ data }: PageProps<ReelsPageData>) {
  const { reels, stats, filter, page, totalPages, success } = data;

  const filters = [
    ["all", "All"],
    ["active", "Active"],
    ["inactive", "Inactive"],
    ["shorts", "Shorts"],
    ["youtube", "YouTube"],
    ["facebook", "Facebook"],
  ];

  return (
    <AdminLayout title="Video Reels" currentPage="reels">
      {success && (
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success === "toggled" && "Video status toggled."}
          {success === "deleted" && "Video deleted."}
          {success === "fetched" && "Video fetch triggered."}
          {success === "deactivated_all" && "All videos deactivated."}
        </div>
      )}

      {/* Stats */}
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {[
          ["Total", stats.total, "bg-gray-100 text-gray-700"],
          ["Active", stats.active, "bg-green-100 text-green-700"],
          ["YouTube", stats.youtube, "bg-red-100 text-red-700"],
          ["Facebook", stats.facebook, "bg-blue-100 text-blue-700"],
          ["Shorts", stats.shorts, "bg-purple-100 text-purple-700"],
          ["Views", stats.totalViews, "bg-yellow-100 text-yellow-700"],
        ].map(([label, value, cls]) => (
          <div
            key={label as string}
            class={`${cls} rounded-xl p-3 text-center`}
          >
            <div class="text-2xl font-bold">
              {formatViews(value as number)}
            </div>
            <div class="text-xs font-medium mt-1 opacity-80">
              {label as string}
            </div>
          </div>
        ))}
      </div>

      {/* Actions + Filters */}
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex gap-1">
          {filters.map(([key, label]) => (
            <a
              key={key}
              href={`/admin/reels?filter=${key}`}
              class={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                filter === key
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600 border hover:bg-gray-50"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
        <div class="flex gap-2">
          <form method="POST" class="inline">
            <input type="hidden" name="action" value="fetch_now" />
            <button
              type="submit"
              class="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700"
            >
              Fetch New Videos
            </button>
          </form>
          <form
            method="POST"
            class="inline"
          >
            <input type="hidden" name="action" value="deactivate_all" />
            <button
              type="submit"
              class="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100"
            >
              Deactivate All
            </button>
          </form>
        </div>
      </div>

      {/* Table */}
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Video
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Channel
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Platform
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Views
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {reels.map((reel) => (
              <tr key={reel.id} class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <img
                      src={reel.thumbnailUrl}
                      alt=""
                      class="w-16 h-10 rounded object-cover bg-gray-200"
                      loading="lazy"
                    />
                    <div class="min-w-0">
                      <a
                        href={reel.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm font-medium text-gray-900 hover:text-primary-600 line-clamp-1"
                      >
                        {reel.title}
                      </a>
                      <div class="flex items-center gap-2 text-xs text-gray-400">
                        <span>{reel.publishedAt}</span>
                        {reel.isShort && (
                          <span class="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded text-[10px]">
                            Short
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                  {reel.channelName}
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    class={`text-xs font-medium capitalize ${
                      reel.platform === "youtube"
                        ? "text-red-600"
                        : "text-blue-600"
                    }`}
                  >
                    {reel.platform}
                  </span>
                </td>
                <td class="px-4 py-3 text-center text-sm text-gray-600">
                  {formatViews(reel.viewCount)}
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    class={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      reel.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {reel.isActive ? "Active" : "Off"}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <form method="POST" class="inline">
                      <input type="hidden" name="action" value="toggle" />
                      <input type="hidden" name="id" value={reel.id} />
                      <button
                        type="submit"
                        class="px-2 py-1 text-xs text-gray-600 hover:text-primary-600"
                        title={reel.isActive ? "Deactivate" : "Activate"}
                      >
                        {reel.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form method="POST" class="inline">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={reel.id} />
                      <button
                        type="submit"
                        class="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {reels.length === 0 && (
              <tr>
                <td colspan={6} class="px-4 py-12 text-center text-gray-400">
                  No videos found. Click "Fetch New Videos" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="flex justify-center gap-1 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/admin/reels?filter=${filter}&page=${p}`}
              class={`px-3 py-1.5 rounded text-sm ${
                p === page
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600 border hover:bg-gray-50"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
