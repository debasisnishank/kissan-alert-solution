import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { SUPPORTED_LANGUAGES } from "$utils/constants.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ProfileData {
  user: {
    name: string;
    phone: string;
    email?: string;
    language: string;
    role: string;
  };
}

export const handler: Handlers<ProfileData, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    return ctx.render({
      user: {
        name: ctx.state.user.name,
        phone: ctx.state.user.phone,
        email: ctx.state.user.email,
        language: ctx.state.user.language,
        role: ctx.state.user.role,
      },
    });
  },
};

export default function ProfilePage({ data }: PageProps<ProfileData>) {
  const { user } = data;

  const menuItems = [
    { icon: "user", label: "Edit Profile", href: "/app/profile/edit" },
    {
      icon: "language",
      label: "Language",
      value: SUPPORTED_LANGUAGES[
        user.language as keyof typeof SUPPORTED_LANGUAGES
      ] || user.language,
    },
    {
      icon: "bell",
      label: "Notifications",
      href: "/app/profile/notifications",
    },
    { icon: "help", label: "Help & Support", href: "/app/help" },
    { icon: "info", label: "About", href: "/app/about" },
  ];

  return (
    <AppShell title="Profile" showBack>
      {/* Profile Header */}
      <div class="bg-white rounded-xl border border-gray-100 p-6 mb-4 text-center">
        <div class="w-20 h-20 bg-primary-100 rounded-full mx-auto mb-3 flex items-center justify-center">
          <span class="text-3xl font-bold text-primary-600">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 class="text-xl font-bold text-gray-900">{user.name}</h2>
        <p class="text-sm text-gray-500">{user.phone}</p>
        {user.email && <p class="text-sm text-gray-500">{user.email}</p>}
        <span class="inline-block mt-2 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium capitalize">
          {user.role.replace("_", " ")}
        </span>
      </div>

      {/* Menu Items */}
      <div class="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
        {menuItems.map((item) => (
          <a
            key={item.label}
            href={item.href || "#"}
            class="flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <div class="flex items-center gap-3">
              <MenuIcon type={item.icon} />
              <span class="text-gray-900">{item.label}</span>
            </div>
            {item.value
              ? <span class="text-sm text-gray-500">{item.value}</span>
              : (
                <svg
                  class="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
          </a>
        ))}
      </div>

      {/* Logout */}
      <form action="/api/auth/logout" method="POST" class="mt-4">
        <button
          type="submit"
          class="w-full bg-red-50 text-red-600 py-3 rounded-xl font-semibold hover:bg-red-100"
        >
          Logout
        </button>
      </form>

      <p class="text-center text-xs text-gray-400 mt-6">
        Khetscope v1.0.0
      </p>
    </AppShell>
  );
}

function MenuIcon({ type }: { type: string }) {
  const icons: Record<string, preact.JSX.Element> = {
    user: (
      <svg
        class="w-5 h-5 text-gray-500"
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
    language: (
      <svg
        class="w-5 h-5 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
        />
      </svg>
    ),
    bell: (
      <svg
        class="w-5 h-5 text-gray-500"
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
    help: (
      <svg
        class="w-5 h-5 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    info: (
      <svg
        class="w-5 h-5 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };
  return icons[type] || null;
}
