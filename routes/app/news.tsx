import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  imageUrl: string | null;
}

interface NewsPageData {
  news: NewsItem[];
  advisories: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    severity: string;
    issuedAt: string;
  }>;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
}

const PAGE_SIZE = 10;

export const handler: Handlers<NewsPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const offset = (page - 1) * PAGE_SIZE;

    // Try to fetch news from database
    let news: NewsItem[] = [];
    let total = 0;

    try {
      const countResult = await query<{ count: number }>(
        `SELECT COUNT(*) as count FROM news_articles WHERE is_active = true`,
      );
      total = Number(countResult[0]?.count || 0);

      if (total > 0) {
        const newsData = await query<{
          id: string;
          title: string;
          summary: string;
          category: string;
          source: string;
          source_url: string | null;
          published_at: Date;
          image_url: string | null;
        }>(
          `SELECT id, title, summary, category, source, source_url, published_at, image_url
           FROM news_articles
           WHERE is_active = true
           ORDER BY published_at DESC
           LIMIT $1 OFFSET $2`,
          [PAGE_SIZE, offset],
        );
        news = newsData.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary || "",
          category: n.category || "general",
          source: n.source || "Khetscope",
          sourceUrl: n.source_url,
          publishedAt: new Date(n.published_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          imageUrl: n.image_url,
        }));
      }
    } catch {
      // Database might not have news yet
    }

    // Use mock news if database is empty
    if (news.length === 0 && page === 1) {
      news = getMockNews();
      total = news.length;
    }

    // Get advisories from alerts
    let advisories: NewsPageData["advisories"] = [];
    try {
      const alertData = await query<{
        id: string;
        title: string;
        description: string;
        type: string;
        severity: string;
        created_at: Date;
      }>(
        `SELECT id, title, description, type, severity, created_at
         FROM alerts
         WHERE tenant_id = $1 AND status = 'active' AND expires_at > NOW()
         ORDER BY 
           CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           created_at DESC
         LIMIT 5`,
        [ctx.state.session.tenantId],
      );
      advisories = alertData.map((a) => ({
        id: a.id,
        title: a.title || `${a.type} Alert`,
        message: a.description || "",
        type: a.type,
        severity: a.severity,
        issuedAt: formatTimeAgo(new Date(a.created_at)),
      }));
    } catch {
      advisories = getMockAdvisories();
    }

    if (advisories.length === 0) {
      advisories = getMockAdvisories();
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return ctx.render({
      news,
      advisories,
      pagination: { page, totalPages, total },
    });
  },
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getMockNews(): NewsItem[] {
  return [
    {
      id: "1",
      title: "MSP for Rabi Crops 2025-26 Announced by Government",
      summary:
        "Government announces Minimum Support Price increase for wheat, gram, and other rabi crops. Wheat MSP set at Rs 2,275 per quintal, marking a 6% increase from last year.",
      category: "policy",
      source: "PIB India",
      sourceUrl: "https://pib.gov.in/",
      publishedAt: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      imageUrl:
        "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=300&fit=crop",
    },
    {
      id: "2",
      title: "Weather Advisory: Light Rain Expected in Central India",
      summary:
        "IMD forecasts light to moderate rainfall in Maharashtra, MP, and Chhattisgarh over next 3 days. Farmers advised to plan harvesting and storage accordingly.",
      category: "weather",
      source: "IMD",
      sourceUrl: "https://mausam.imd.gov.in/",
      publishedAt: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      imageUrl:
        "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&h=300&fit=crop",
    },
    {
      id: "3",
      title: "New Pest Alert: Fall Armyworm Detected in Maize Fields",
      summary:
        "ICAR issues advisory on fall armyworm infestation in maize-growing regions. Integrated pest management with recommended pesticides suggested.",
      category: "pest",
      source: "ICAR",
      sourceUrl: "https://icar.org.in/",
      publishedAt: new Date(Date.now() - 86400000).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      imageUrl:
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop",
    },
    {
      id: "4",
      title: "PM-KISAN: 16th Installment Released to 9.5 Crore Farmers",
      summary:
        "Over Rs 20,000 crore disbursed to eligible farmers under PM-KISAN scheme. Check your eligibility status and payment history online.",
      category: "scheme",
      source: "Ministry of Agriculture",
      sourceUrl: "https://pmkisan.gov.in/",
      publishedAt: new Date(Date.now() - 172800000).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      ),
      imageUrl:
        "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=300&fit=crop",
    },
    {
      id: "5",
      title: "Soybean Prices Rise 5% on Strong Export Demand",
      summary:
        "Soybean prices see sharp increase in major mandis of Madhya Pradesh and Maharashtra due to strong export demand and lower domestic arrivals.",
      category: "market",
      source: "Agmarknet",
      sourceUrl: "https://agmarknet.gov.in/",
      publishedAt: new Date(Date.now() - 259200000).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      ),
      imageUrl:
        "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop",
    },
    {
      id: "6",
      title: "New High-Yielding Wheat Variety Released by ICAR",
      summary:
        "ICAR-IIWBR releases DBW-327, a new wheat variety with 15% higher yield potential and resistance to yellow rust. Seeds available from authorized dealers.",
      category: "research",
      source: "ICAR",
      sourceUrl: "https://icar.org.in/",
      publishedAt: new Date(Date.now() - 345600000).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      ),
      imageUrl:
        "https://images.unsplash.com/photo-1437252611977-07f74518abd7?w=400&h=300&fit=crop",
    },
    {
      id: "7",
      title: "Cotton Farmers to Get Additional Subsidy on Bt Seeds",
      summary:
        "State government announces 50% subsidy on certified Bt cotton seeds for small and marginal farmers. Registration open till next month.",
      category: "scheme",
      source: "State Agriculture Dept",
      sourceUrl: "https://agricoop.nic.in/",
      publishedAt: new Date(Date.now() - 432000000).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      ),
      imageUrl:
        "https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?w=400&h=300&fit=crop",
    },
    {
      id: "8",
      title: "Organic Farming Training Program Launched",
      summary:
        "NABARD and KVKs launch free training program on organic farming practices. Certificate course includes composting, biopesticides, and certification process.",
      category: "training",
      source: "NABARD",
      sourceUrl: "https://nabard.org/",
      publishedAt: new Date(Date.now() - 518400000).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
      ),
      imageUrl:
        "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=300&fit=crop",
    },
  ];
}

function getMockAdvisories(): NewsPageData["advisories"] {
  return [
    {
      id: "a1",
      title: "Irrigation Advisory for Wheat Farmers",
      message:
        "Based on current weather forecast and soil moisture levels, schedule irrigation within next 2-3 days for wheat crops in tillering stage.",
      type: "irrigation",
      severity: "medium",
      issuedAt: "Today",
    },
    {
      id: "a2",
      title: "Fertilizer Application Reminder",
      message:
        "Time for second dose of nitrogen (urea) application for rabi crops sown in November. Apply 25-30 kg/acre during irrigation.",
      type: "fertilizer",
      severity: "low",
      issuedAt: "Yesterday",
    },
    {
      id: "a3",
      title: "Frost Warning for North India",
      message:
        "Cold wave expected in Punjab, Haryana, and UP. Protect vegetable crops with mulching. Light irrigation in evening can help.",
      type: "weather",
      severity: "high",
      issuedAt: "2 days ago",
    },
  ];
}

export default function NewsPage({ data }: PageProps<NewsPageData>) {
  const { news, advisories, pagination } = data;

  const categoryConfig: Record<string, { color: string; icon: string }> = {
    policy: { color: "bg-purple-100 text-purple-700", icon: "📜" },
    weather: { color: "bg-blue-100 text-blue-700", icon: "🌤️" },
    pest: { color: "bg-red-100 text-red-700", icon: "🐛" },
    scheme: { color: "bg-green-100 text-green-700", icon: "💰" },
    market: { color: "bg-orange-100 text-orange-700", icon: "📈" },
    research: { color: "bg-cyan-100 text-cyan-700", icon: "🔬" },
    training: { color: "bg-yellow-100 text-yellow-700", icon: "📚" },
    general: { color: "bg-gray-100 text-gray-700", icon: "📰" },
  };

  const severityColors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
  };

  return (
    <AppShell title="News & Advisories" showBack>
      {/* Advisories Section */}
      {advisories.length > 0 && (
        <div class="mb-6">
          <h2 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Active Advisories
          </h2>
          <div class="space-y-3">
            {advisories.map((advisory) => (
              <div
                key={advisory.id}
                class="bg-white border-l-4 rounded-xl p-4 shadow-sm"
                style={{
                  borderLeftColor: advisory.severity === "high" ||
                      advisory.severity === "critical"
                    ? "#ef4444"
                    : "#3b82f6",
                }}
              >
                <div class="flex items-start gap-3">
                  <div
                    class={`w-2 h-2 rounded-full mt-2 ${
                      severityColors[advisory.severity] || "bg-blue-500"
                    }`}
                  >
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-medium text-gray-900">
                        {advisory.title}
                      </h3>
                      <span
                        class={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          advisory.severity === "high" ||
                            advisory.severity === "critical"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {advisory.severity}
                      </span>
                    </div>
                    <p class="text-sm text-gray-600">{advisory.message}</p>
                    <p class="text-xs text-gray-400 mt-2">
                      {advisory.issuedAt}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News Feed */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-900">Agri News</h2>
          <span class="text-sm text-gray-500">{pagination.total} articles</span>
        </div>

        {news.length === 0
          ? (
            <div class="bg-white rounded-xl p-8 text-center border">
              <p class="text-gray-500">No news articles available</p>
            </div>
          )
          : (
            <div class="space-y-4">
              {news.map((item, idx) => {
                const config = categoryConfig[item.category] ||
                  categoryConfig.general;
                const isFeature = idx === 0 && pagination.page === 1;

                return (
                  <article
                    key={item.id}
                    class={`bg-white rounded-xl border overflow-hidden ${
                      isFeature ? "shadow-md" : ""
                    }`}
                  >
                    {/* Feature image for first article */}
                    {isFeature && item.imageUrl && (
                      <div class="aspect-video bg-gray-100 relative">
                        <img
                          src={item.imageUrl}
                          alt=""
                          class="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                          <span
                            class={`px-2 py-1 rounded text-xs font-medium ${config.color}`}
                          >
                            {config.icon} {item.category}
                          </span>
                        </div>
                      </div>
                    )}

                    <div class="p-4">
                      {!isFeature && (
                        <div class="flex gap-3">
                          {item.imageUrl && (
                            <div class="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                              <img
                                src={item.imageUrl}
                                alt=""
                                class="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div class="flex-1">
                            <span
                              class={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
                            >
                              {config.icon} {item.category}
                            </span>
                            <h3 class="font-medium text-gray-900 mt-1 line-clamp-2">
                              {item.title}
                            </h3>
                            <p class="text-xs text-gray-500 mt-1 line-clamp-2">
                              {item.summary}
                            </p>
                          </div>
                        </div>
                      )}

                      {isFeature && (
                        <>
                          <h3 class="font-semibold text-gray-900 text-lg mb-2">
                            {item.title}
                          </h3>
                          <p class="text-sm text-gray-600 mb-3">
                            {item.summary}
                          </p>
                        </>
                      )}

                      <div class="flex items-center justify-between mt-3 pt-3 border-t">
                        <div class="flex items-center gap-2 text-xs text-gray-400">
                          <span>{item.source}</span>
                          <span>•</span>
                          <span>{item.publishedAt}</span>
                        </div>
                        {item.sourceUrl
                          ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-primary-600 text-sm font-medium hover:underline"
                            >
                              Read More →
                            </a>
                          )
                          : (
                            <span class="text-gray-400 text-sm">
                              Source unavailable
                            </span>
                          )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div class="flex items-center justify-center gap-2 mt-6">
            {pagination.page > 1 && (
              <a
                href={`/app/news?page=${pagination.page - 1}`}
                class="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </a>
            )}

            <span class="px-4 py-2 text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            {pagination.page < pagination.totalPages && (
              <a
                href={`/app/news?page=${pagination.page + 1}`}
                class="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </a>
            )}
          </div>
        )}
      </div>

      {/* Show More Link */}
      <div class="mt-6 text-center">
        <p class="text-sm text-gray-500 mb-2">
          Stay updated with latest agricultural news and advisories
        </p>
        <a
          href="/app/alerts"
          class="text-primary-600 text-sm font-medium hover:underline"
        >
          View All Alerts →
        </a>
      </div>
    </AppShell>
  );
}
