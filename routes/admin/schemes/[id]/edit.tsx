import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, queryOne } from "$db/client.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

interface Scheme {
  id: string;
  name: string;
  description: string;
  type: string;
  eligibility: string | null;
  benefits: string | null;
  deadline: string | null;
  document_url: string | null;
  is_active: boolean;
}

interface PageData {
  scheme: Scheme | null;
  success?: string;
  error?: string;
}

export const handler: Handlers<PageData, AuthState> = {
  async GET(_req, ctx) {
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

    const schemeId = ctx.params.id;

    const scheme = await queryOne<Scheme>(
      `SELECT id, name, description, type, eligibility, benefits,
              deadline::text, document_url, is_active
       FROM government_schemes WHERE id = $1`,
      [schemeId],
    );

    return ctx.render({ scheme });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      (ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin")
    ) {
      return new Response(null, { status: 401 });
    }

    const schemeId = ctx.params.id;
    const form = await req.formData();
    const action = form.get("action") as string;

    if (action === "delete") {
      await execute(`DELETE FROM government_schemes WHERE id = $1`, [schemeId]);
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/schemes?success=deleted" },
      });
    }

    if (action === "toggle_active") {
      await execute(
        `UPDATE government_schemes SET is_active = NOT is_active WHERE id = $1`,
        [schemeId],
      );
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/admin/schemes/${schemeId}/edit?success=toggled`,
        },
      });
    }

    if (action === "update") {
      const name = form.get("name") as string;
      const description = form.get("description") as string;
      const type = form.get("type") as string;
      const eligibility = form.get("eligibility") as string;
      const benefits = form.get("benefits") as string;
      const deadline = form.get("deadline") as string;
      const documentUrl = form.get("document_url") as string;

      if (!name || !description) {
        const scheme = await queryOne<Scheme>(
          `SELECT id, name, description, type, eligibility, benefits,
                  deadline::text, document_url, is_active
           FROM government_schemes WHERE id = $1`,
          [schemeId],
        );
        return ctx.render({
          scheme,
          error: "Name and description are required",
        });
      }

      try {
        await execute(
          `UPDATE government_schemes
           SET name = $1, description = $2, type = $3, eligibility = $4,
               benefits = $5, deadline = $6, document_url = $7
           WHERE id = $8`,
          [
            name,
            description,
            type || "general",
            eligibility || null,
            benefits || null,
            deadline || null,
            documentUrl || null,
            schemeId,
          ],
        );

        return new Response(null, {
          status: 302,
          headers: {
            Location: `/admin/schemes/${schemeId}/edit?success=updated`,
          },
        });
      } catch (e) {
        console.error("Error updating scheme:", e);
        const scheme = await queryOne<Scheme>(
          `SELECT id, name, description, type, eligibility, benefits,
                  deadline::text, document_url, is_active
           FROM government_schemes WHERE id = $1`,
          [schemeId],
        );
        return ctx.render({ scheme, error: "Failed to update scheme" });
      }
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/schemes/${schemeId}/edit` },
    });
  },
};

export default function EditSchemePage({ data }: PageProps<PageData>) {
  const { scheme, success, error } = data;
  const url = new URL("http://x" + (globalThis?.location?.search || ""));
  const successParam = success || url.searchParams?.get("success");

  if (!scheme) {
    return (
      <AdminLayout title="Scheme Not Found" currentPage="schemes">
        <div class="text-center py-20">
          <p class="text-gray-500 text-lg">Scheme not found</p>
          <a
            href="/admin/schemes"
            class="text-primary-600 mt-4 inline-block"
          >
            Back to Schemes
          </a>
        </div>
      </AdminLayout>
    );
  }

  const schemeTypes = [
    { id: "subsidy", label: "Subsidy", desc: "Direct financial support" },
    { id: "insurance", label: "Insurance", desc: "Crop/livestock insurance" },
    { id: "loan", label: "Loan", desc: "Credit facilities" },
    { id: "training", label: "Training", desc: "Skill development programs" },
    { id: "general", label: "General", desc: "Other schemes" },
  ];

  return (
    <AdminLayout title={`Edit: ${scheme.name}`} currentPage="schemes">
      <div class="max-w-2xl mx-auto">
        {successParam === "updated" && (
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Scheme updated successfully.
          </div>
        )}
        {successParam === "toggled" && (
          <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            Scheme status toggled.
          </div>
        )}
        {error && (
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Status bar */}
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <span
              class={`px-2.5 py-1 text-xs font-medium rounded-full ${
                scheme.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {scheme.is_active ? "Active" : "Inactive"}
            </span>
            <span class="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 capitalize">
              {scheme.type}
            </span>
          </div>
        </div>

        {/* Edit Form */}
        <div class="bg-white rounded-xl shadow-sm border p-6">
          <form method="POST" class="space-y-6">
            <input type="hidden" name="action" value="update" />

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Scheme Name *
              </label>
              <input
                type="text"
                name="name"
                required
                value={scheme.name}
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
              >
                {scheme.description}
              </textarea>
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
                      checked={scheme.type === t.id}
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
              >
                {scheme.eligibility || ""}
              </textarea>
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
              >
                {scheme.benefits || ""}
              </textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Application Deadline
                </label>
                <input
                  type="date"
                  name="deadline"
                  value={scheme.deadline || ""}
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
                  value={scheme.document_url || ""}
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
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Actions */}
        <div class="mt-6 flex gap-3">
          <form method="POST">
            <input type="hidden" name="action" value="toggle_active" />
            <button
              type="submit"
              class={`px-4 py-2 rounded-lg text-sm font-medium border ${
                scheme.is_active
                  ? "border-red-300 text-red-600 hover:bg-red-50"
                  : "border-green-300 text-green-600 hover:bg-green-50"
              }`}
            >
              {scheme.is_active ? "Deactivate Scheme" : "Activate Scheme"}
            </button>
          </form>

          <form method="POST">
            <input type="hidden" name="action" value="delete" />
            <button
              type="submit"
              class="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50"
            >
              Delete Scheme
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
