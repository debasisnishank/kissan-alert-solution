import { ComponentChildren } from "preact";
import { Head } from "$fresh/runtime.ts";
import { SITE_DESCRIPTION, SITE_NAME } from "$utils/constants.ts";
import AIAssistant from "../islands/AIAssistant.tsx";

interface LayoutProps {
  title?: string;
  description?: string;
  children: ComponentChildren;
}

export function Layout({ title, description, children }: LayoutProps) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const pageDescription = description || SITE_DESCRIPTION;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#059669" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Compass" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div class="min-h-screen bg-gray-50">
        {children}
      </div>
    </>
  );
}

interface AppShellProps {
  title?: string;
  children: ComponentChildren;
  showBack?: boolean;
  actions?: ComponentChildren;
  farmContext?: {
    farmName?: string;
    location?: string;
    activeCrop?: string;
    cropStage?: string;
    healthScore?: number;
    daysAfterSowing?: number;
  };
}

export function AppShell(
  { title, children, showBack, actions, farmContext }: AppShellProps,
) {
  return (
    <div class="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header class="bg-primary-600 text-white px-4 py-3 sticky top-0 z-40 shadow-md">
        <div class="flex items-center justify-between max-w-lg mx-auto">
          <div class="flex items-center gap-3">
            {showBack && (
              <a href="/app" class="p-1 -ml-1 hover:bg-primary-700 rounded-lg">
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
            )}
            <h1 class="text-lg font-semibold">{title || SITE_NAME}</h1>
          </div>
          {actions && <div class="flex items-center gap-2">{actions}</div>}
        </div>
      </header>

      {/* Content */}
      <main class="max-w-lg mx-auto px-4 py-4">
        {children}
      </main>

      {/* AI Assistant */}
      <AIAssistant
        farmName={farmContext?.farmName}
        location={farmContext?.location}
        activeCrop={farmContext?.activeCrop}
        cropStage={farmContext?.cropStage}
        healthScore={farmContext?.healthScore}
        daysAfterSowing={farmContext?.daysAfterSowing}
      />

      {/* Bottom Navigation */}
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div class="max-w-lg mx-auto flex justify-around">
          <NavItem href="/app" icon="home" label="Home" />
          <NavItem href="/app/reels" icon="reels" label="Reels" />
          <NavItem href="/app/farm" icon="farm" label="My Farm" />
          <NavItem href="/app/market" icon="market" label="Market" />
          <NavItem href="/app/profile" icon="profile" label="Profile" />
        </div>
      </nav>
    </div>
  );
}

interface NavItemProps {
  href: string;
  icon: "home" | "alert" | "farm" | "reels" | "market" | "profile";
  label: string;
}

function NavItem({ href, icon, label }: NavItemProps) {
  const icons = {
    home: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
    alert: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
    ),
    farm: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
        />
      </svg>
    ),
    reels: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
    market: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    profile: (
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  };

  return (
    <a
      href={href}
      class="flex flex-col items-center py-1 px-3 text-gray-600 hover:text-primary-600"
    >
      {icons[icon]}
      <span class="text-xs mt-1">{label}</span>
    </a>
  );
}
