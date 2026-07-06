import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import type { AuthState } from "../../../middlewares/auth.ts";
import ProfileEditForm from "$islands/ProfileEditForm.tsx";

interface EditProfileData {
  user: {
    id: string;
    name: string;
    phone: string;
    email: string;
  };
}

export const handler: Handlers<EditProfileData, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    return ctx.render({
      user: {
        id: ctx.state.user.id,
        name: ctx.state.user.name,
        phone: ctx.state.user.phone,
        email: ctx.state.user.email || "",
      },
    });
  },
};

export default function EditProfilePage({ data }: PageProps<EditProfileData>) {
  return (
    <AppShell title="Edit Profile" showBack>
      <div class="bg-white rounded-xl border p-4">
        <ProfileEditForm
          userId={data.user.id}
          initialName={data.user.name}
          initialEmail={data.user.email}
          phone={data.user.phone}
        />
      </div>
    </AppShell>
  );
}
