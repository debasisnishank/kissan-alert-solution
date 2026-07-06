import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string;
  publishedAt: string;
  isActive: boolean;
  summary: string | null;
}

interface NewsPageData {
  news: NewsItem[];
  stats: {
    total: number;
    active: number;
    today: number;
    sources: number;
  };
  filter: string;
  page: number;
  totalPages: number;
  success?: string;
}

export const handler: Handlers<NewsPageData, AuthState> = {
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
    if (filter === "active") whereClause = "WHERE is_active = true";
    else if (filter === "inactive") whereClause = "WHERE is_active = false";
    else if (filter === "today") {
      whereClause = "WHERE published_at >= CURRENT_DATE";
    }

    let newsResult: Array<{
      id: string;
      title: string;
      source: string;
      category: string;
      url: string;
      published_at: Date;
      is_active: boolean;
      summary: string | null;
    }> = [];
    let statsVal = { total: 0, active: 0, today: 0, sources: 0 };
    let totalCount = 0;

    try {
      const [news, stats, count] = await Promise.all([
        query<{
          id: string;
          title: string;
          source: string;
          category: string;
          url: string;
          published_at: Date;
          is_active: boolean;
          summary: string | null;
        }>(
          `SELECT id, title, source, category, url, published_at, 
                  COALESCE(is_active, true) as is_active, summary
           FROM news_articles ${whereClause}
           ORDER BY published_at DESC
           LIMIT ${limit} OFFSET ${offset}`,
          [],
        ),
        queryOne<{
          total: number;
          active: number;
          today: number;
          sources: number;
        }>(
          `SELECT
             COUNT(*)::int as total,
             COUNT(*) FILTER (WHERE COALESCE(is_active, true))::int as active,
             COUNT(*) FILTER (WHERE published_at >= CURRENT_DATE)::int as today,
             COUNT(DISTINCT source)::int as sources
           FROM news_articles`,
          [],
        ),
        queryOne<{ count: number }>(
          `SELECT COUNT(*)::int as count FROM news_articles ${whereClause}`,
          [],
        ),
      ]);
      newsResult = news;
      statsVal = stats || statsVal;
      totalCount = count?.count || 0;
    } catch {
      // table doesn't exist yet, show empty state
    }

    return ctx.render({
      news: newsResult.map((n) => ({
        id: n.id,
        title: n.title,
        source: n.source,
        category: n.category || "general",
        url: n.url,
        publishedAt: new Date(n.published_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        isActive: n.is_active,
        summary: n.summary,
      })),
      stats: statsVal,
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

    try {
      if (action === "toggle") {
        const id = form.get("id") as string;
        await execute(
          `UPDATE news_articles SET is_active = NOT COALESCE(is_active, true) WHERE id = $1`,
          [id],
        );
      } else if (action === "delete") {
        const id = form.get("id") as string;
        await execute(`DELETE FROM news_articles WHERE id = $1`, [id]);
      } else if (action === "fetch_now") {
        try {
          const { crawlAllSources } = await import("$lib/news/crawler.ts");
          await crawlAllSources();
        } catch (err) {
          console.error("Manual news fetch error:", err);
        }
      }
    } catch (err) {
      console.error("News admin action error:", err);
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/news?success=${action}` },
    });
  },
};

export default function AdminNews({ data }: PageProps<NewsPageData>) {
  const { news, stats, filter, page, totalPages, success } = data;

  const filters = [
    ["all", "All"],
    ["active", "Active"],
    ["inactive", "Hidden"],
    ["today", "Today"],
  ];

  return (
    <AdminLayout title="News Management" currentPage="news">
      {success && (
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Action completed successfully.
        </div>
      )}

      {/* Stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ["Total Articles", stats.total, "bg-gray-100 text-gray-700"],
          ["Active", stats.active, "bg-green-100 text-green-700"],
          ["Today", stats.today, "bg-blue-100 text-blue-700"],
          ["Sources", stats.sources, "bg-purple-100 text-purple-700"],
        ].map(([label, value, cls]) => (
          <div
            key={label as string}
            class={`${cls} rounded-xl p-3 text-center`}
          >
            <div class="text-2xl font-bold">{value as number}</div>
            <div class="text-xs font-medium mt-1 opacity-80">
              {label as string}
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Actions */}
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex gap-1">
          {filters.map(([key, label]) => (
            <a
              key={key}
              href={`/admin/news?filter=${key}`}
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
        <form method="POST">
          <input type="hidden" name="action" value="fetch_now" />
          <button
            type="submit"
            class="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700"
          >
            Fetch News Now
          </button>
        </form>
      </div>

      {/* Table */}
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Article
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Source
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Category
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Published
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
            {news.map((item) => (
              <tr key={item.id} class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm font-medium text-gray-900 hover:text-primary-600 line-clamp-1"
                  >
                    {item.title}
                  </a>
                  {item.summary && (
                    <p class="text-xs text-gray-400 line-clamp-1 mt-0.5">
                      {item.summary}
                    </p>
                  )}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{item.source}</td>
                <td class="px-4 py-3 text-center">
                  <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
                    {item.category}
                  </span>
                </td>
                <td class="px-4 py-3 text-center text-xs text-gray-500">
                  {item.publishedAt}
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    class={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.isActive ? "Active" : "Hidden"}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <form method="POST" class="inline">
                      <input type="hidden" name="action" value="toggle" />
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        class="px-2 py-1 text-xs text-gray-600 hover:text-primary-600"
                      >
                        {item.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form method="POST" class="inline">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={item.id} />
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
            {news.length === 0 && (
              <tr>
                <td colspan={6} class="px-4 py-12 text-center text-gray-400">
                  No news articles found. Click "Fetch News Now" to crawl.
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
              href={`/admin/news?filter=${filter}&page=${p}`}
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
