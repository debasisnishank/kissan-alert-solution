import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import FarmForm from "$islands/FarmForm.tsx";
import type { AuthState } from "../../../middlewares/auth.ts";
import { CROP_TYPES, IRRIGATION_TYPES } from "$utils/constants.ts";

interface AddFarmPageData {
  cropTypes: typeof CROP_TYPES;
  irrigationTypes: typeof IRRIGATION_TYPES;
}

export const handler: Handlers<AddFarmPageData, AuthState> = {
  GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    return ctx.render({
      cropTypes: CROP_TYPES,
      irrigationTypes: IRRIGATION_TYPES,
    });
  },
};

export default function AddFarmPage({ data }: PageProps<AddFarmPageData>) {
  return (
    <AppShell title="Add Farm" showBack>
      <FarmForm
        cropTypes={data.cropTypes}
        irrigationTypes={data.irrigationTypes}
      />
    </AppShell>
  );
}
