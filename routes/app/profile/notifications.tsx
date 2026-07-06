import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import type { AuthState } from "../../../middlewares/auth.ts";
import NotificationSettings from "$islands/NotificationSettings.tsx";

interface NotificationData {
  userId: string;
}

export const handler: Handlers<NotificationData, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    return ctx.render({
      userId: ctx.state.user.id,
    });
  },
};

export default function NotificationsPage(
  { data }: PageProps<NotificationData>,
) {
  return (
    <AppShell title="Notifications" showBack>
      <div class="space-y-4">
        <NotificationSettings userId={data.userId} />
      </div>
    </AppShell>
  );
}
