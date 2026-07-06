import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { getBankCustomerById } from "$lib/bank.ts";
import BankFarmForm from "$islands/BankFarmForm.tsx";
import type { AuthState } from "../../../../middlewares/auth.ts";
import { CROP_TYPES, IRRIGATION_TYPES } from "$utils/constants.ts";

interface AddFarmPageData {
  customerId: string;
  userId: string;
  customerName: string;
  cropTypes: typeof CROP_TYPES;
  irrigationTypes: typeof IRRIGATION_TYPES;
}

export const handler: Handlers<AddFarmPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const allowedRoles = ["bank_officer", "admin", "tenant_admin"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, { status: 302, headers: { Location: "/app" } });
    }

    const customerId = ctx.params.id;
    const tenantId = ctx.state.session.tenantId;

    const customer = await getBankCustomerById(customerId, tenantId);
    if (!customer) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/customers" },
      });
    }

    return ctx.render({
      customerId: customer.id,
      userId: customer.userId,
      customerName: customer.name,
      cropTypes: CROP_TYPES,
      irrigationTypes: IRRIGATION_TYPES,
    });
  },
};

export default function AddFarmForCustomerPage(
  { data }: PageProps<AddFarmPageData>,
) {
  return (
    <Layout title={`Add Farm - ${data.customerName}`}>
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
            <a
              href={`/bank/customers/${data.customerId}`}
              class="text-gray-500 hover:text-gray-700"
            >
              ← Back
            </a>
            <div>
              <h1 class="text-xl font-bold text-gray-900">Add Farm</h1>
              <p class="text-sm text-gray-500">For {data.customerName}</p>
            </div>
          </div>
        </header>

        <main class="max-w-4xl mx-auto px-6 py-6">
          <BankFarmForm
            customerId={data.customerId}
            userId={data.userId}
            customerName={data.customerName}
            cropTypes={data.cropTypes}
            irrigationTypes={data.irrigationTypes}
          />
        </main>
      </div>
    </Layout>
  );
}
