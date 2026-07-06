import { ComponentChildren } from "preact";
import { Head } from "$fresh/runtime.ts";
import { SITE_NAME } from "$utils/constants.ts";

interface AdminLayoutProps {
  title: string;
  currentPage:
    | "dashboard"
    | "farms"
    | "users"
    | "alerts"
    | "schemes"
    | "products"
    | "reels"
    | "news"
    | "sync"
    | "analytics"
    | "logs"
    | "manufacturers"
    | "leads"
    | "notifications"
    | "ai-settings";
  children: ComponentChildren;
}

const NAV_ITEMS = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: "grid" },
  { key: "leads", href: "/admin/leads", label: "CRM Leads", icon: "target" },
  {
    key: "notifications",
    href: "/admin/notifications",
    label: "Notifications",
    icon: "megaphone",
  },
  { key: "farms", href: "/admin/farms", label: "Farms", icon: "sprout" },
  { key: "users", href: "/admin/users", label: "Users", icon: "users" },
  { key: "alerts", href: "/admin/alerts", label: "Alerts", icon: "bell" },
  { key: "reels", href: "/admin/reels", label: "Reels", icon: "video" },
  { key: "news", href: "/admin/news", label: "News", icon: "newspaper" },
  { key: "schemes", href: "/admin/schemes", label: "Schemes", icon: "shield" },
  {
    key: "products",
    href: "/admin/products",
    label: "Products",
    icon: "package",
  },
  {
    key: "manufacturers",
    href: "/admin/manufacturers",
    label: "Manufacturers",
    icon: "factory",
  },
  { key: "sync", href: "/admin/sync", label: "Sync", icon: "refresh" },
  {
    key: "analytics",
    href: "/admin/analytics",
    label: "Analytics",
    icon: "chart",
  },
  { key: "logs", href: "/admin/logs", label: "Audit Logs", icon: "list" },
  {
    key: "ai-settings",
    href: "/admin/ai-settings",
    label: "AI Provider",
    icon: "grid",
  },
];

function NavIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    grid:
      "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    sprout:
      "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    users:
      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    bell:
      "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    video:
      "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
    newspaper:
      "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z",
    shield:
      "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    package: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    factory:
      "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    refresh:
      "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    chart:
      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    megaphone:
      "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
    target:
      "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
    list:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  };
  return (
    <svg
      class="w-5 h-5 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d={icons[icon] || icons.grid}
      />
    </svg>
  );
}

export function AdminLayout(
  { title, currentPage, children }: AdminLayoutProps,
) {
  return (
    <>
      <Head>
        <title>{title} | Admin | {SITE_NAME}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div class="min-h-screen bg-gray-100 flex">
        {/* Sidebar */}
        <aside class="w-60 bg-gray-900 text-gray-300 flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
          {/* Logo */}
          <div class="px-4 py-5 border-b border-gray-800">
            <a href="/admin" class="flex items-center gap-3">
              <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg
                  class="w-5 h-5 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <span class="text-white font-bold text-sm">Compass</span>
                <span class="block text-xs text-gray-500">Admin Panel</span>
              </div>
            </a>
          </div>

          {/* Nav */}
          <nav class="flex-1 px-3 py-4 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = currentPage === item.key;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  class={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-primary-600/20 text-primary-400 font-medium"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Footer */}
          <div class="px-3 py-4 border-t border-gray-800 space-y-1">
            <a
              href="/app"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M11 17l-5-5m0 0l5-5m-5 5h12"
                />
              </svg>
              Back to App
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <div class="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header class="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30">
            <h1 class="text-lg font-semibold text-gray-900">{title}</h1>
          </header>

          {/* Page Content */}
          <main class="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
