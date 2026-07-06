import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import type { AuthState } from "../../../../middlewares/auth.ts";
import { getFarmById } from "$lib/farm.ts";
import FarmProcessing from "$islands/FarmProcessing.tsx";

interface ProcessingData {
  farmId: string;
  farmName: string;
}

export const handler: Handlers<ProcessingData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const farmId = ctx.params.id;
    const farm = await getFarmById(farmId, ctx.state.session.tenantId);

    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app" },
      });
    }

    return ctx.render({
      farmId: farm.id,
      farmName: farm.name,
    });
  },
};

export default function FarmProcessingPage(
  { data }: PageProps<ProcessingData>,
) {
  return (
    <Layout title="Setting Up Your Farm">
      <FarmProcessing farmId={data.farmId} farmName={data.farmName} />
    </Layout>
  );
}
