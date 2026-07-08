import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import FarmForm from "$islands/FarmForm.tsx";
import { getFarmById } from "$lib/farm.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";
import { CROP_TYPES, IRRIGATION_TYPES } from "$utils/constants.ts";

interface EditFarmPageData {
  cropTypes: typeof CROP_TYPES;
  irrigationTypes: typeof IRRIGATION_TYPES;
  farm: {
    id: string;
    name: string;
    state: string;
    district: string;
    village: string;
    soilType: string;
    waterSource: string;
    polygonCoords: number[][];
  };
}

export const handler: Handlers<EditFarmPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { id } = ctx.params;
    const farm = await getFarmById(id, ctx.state.session.tenantId);

    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    return ctx.render({
      cropTypes: CROP_TYPES,
      irrigationTypes: IRRIGATION_TYPES,
      farm: {
        id: farm.id,
        name: farm.name,
        state: farm.state ?? "Maharashtra",
        district: farm.district ?? "",
        village: farm.village ?? "",
        soilType: farm.soilType ?? "black_cotton",
        waterSource: farm.waterSource ?? "tubewell",
        polygonCoords: farm.polygon?.coordinates?.[0] ?? [],
      },
    });
  },
};

export default function EditFarmPage({ data }: PageProps<EditFarmPageData>) {
  return (
    <AppShell title="Edit Farm" showBack>
      <FarmForm
        cropTypes={data.cropTypes}
        irrigationTypes={data.irrigationTypes}
        farm={data.farm}
      />
    </AppShell>
  );
}
