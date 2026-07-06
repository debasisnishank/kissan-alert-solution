import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface CreateSchemePageData {
  error?: string;
}

export const handler: Handlers<CreateSchemePageData, AuthState> = {
  GET(_req, ctx) {
    if (
      !ctx.state.session ||
      (ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin")
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }
    return ctx.render({});
  },

  async POST(req, ctx) {
    if (!ctx.state.session) return new Response(null, { status: 401 });

    const formData = await req.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const type = formData.get("type") as string;
    const eligibility = formData.get("eligibility") as string;
    const benefits = formData.get("benefits") as string;
    const deadline = formData.get("deadline") as string;
    const documentUrl = formData.get("document_url") as string;

    if (!name || !description) {
      return ctx.render({ error: "Name and description are required" });
    }

    try {
      await execute(
        `INSERT INTO government_schemes (id, name, description, type, eligibility, benefits, deadline, document_url, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true)`,
        [
          name,
          description,
          type || "general",
          eligibility,
          benefits,
          deadline || null,
          documentUrl,
        ],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/schemes?success=created" },
      });
    } catch (e) {
      console.error("Error creating scheme:", e);
      return ctx.render({ error: "Failed to create scheme" });
    }
  },
};

export default function CreateSchemePage(
  { data }: PageProps<CreateSchemePageData>,
) {
  const schemeTypes = [
    { id: "subsidy", label: "Subsidy", desc: "Direct financial support" },
    { id: "insurance", label: "Insurance", desc: "Crop/livestock insurance" },
    { id: "loan", label: "Loan", desc: "Credit facilities" },
    { id: "training", label: "Training", desc: "Skill development programs" },
    { id: "general", label: "General", desc: "Other schemes" },
  ];

  return (
    <AdminLayout title="Create New Scheme" currentPage="schemes">
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg border p-6">
          {data.error && (
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {data.error}
            </div>
          )}

          <form method="POST" class="space-y-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Scheme Name *
              </label>
              <input
                type="text"
                name="name"
                required
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., PM-KISAN"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                name="description"
                required
                rows={3}
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Brief description of the scheme"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <div class="grid grid-cols-2 gap-3">
                {schemeTypes.map((t) => (
                  <label
                    key={t.id}
                    class="flex flex-col p-3 border rounded-lg cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={t.id}
                      class="sr-only"
                      defaultChecked={t.id === "general"}
                    />
                    <span class="font-medium text-gray-900">{t.label}</span>
                    <span class="text-xs text-gray-500">{t.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Eligibility Criteria
              </label>
              <textarea
                name="eligibility"
                rows={2}
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Who can apply for this scheme?"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Benefits
              </label>
              <textarea
                name="benefits"
                rows={2}
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="What benefits does this scheme provide?"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Application Deadline
                </label>
                <input
                  type="date"
                  name="deadline"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Document URL
                </label>
                <input
                  type="url"
                  name="document_url"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div class="flex gap-3 pt-4">
              <a
                href="/admin/schemes"
                class="flex-1 py-2 border rounded-lg text-center text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </a>
              <button
                type="submit"
                class="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Create Scheme
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
