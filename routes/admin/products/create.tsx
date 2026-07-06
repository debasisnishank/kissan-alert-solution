import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";
import { CROP_CATEGORIES } from "$utils/constants.ts";

interface CreateProductPageData {
  manufacturers: string[];
  error?: string;
}

export const handler: Handlers<CreateProductPageData, AuthState> = {
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

    const manufacturers = await query<{ name: string }>(
      `SELECT DISTINCT name FROM manufacturers WHERE is_active = true ORDER BY name`,
      [],
    );

    return ctx.render({ manufacturers: manufacturers.map((m) => m.name) });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) return new Response(null, { status: 401 });

    const formData = await req.formData();
    const name = formData.get("name") as string;
    const category = formData.get("category") as string;
    const manufacturer = formData.get("manufacturer") as string;
    const description = formData.get("description") as string;
    const composition = formData.get("composition") as string;
    const price = parseFloat(formData.get("price") as string) || 0;
    const unit = formData.get("unit") as string;
    const recommendedFor = formData.getAll("recommended_for") as string[];
    const usageInstructions = formData.get("usage_instructions") as string;
    const safetyPrecautions = formData.get("safety_precautions") as string;

    if (!name || !category) {
      const manufacturers = await query<{ name: string }>(
        `SELECT DISTINCT name FROM manufacturers WHERE is_active = true`,
        [],
      );
      return ctx.render({
        manufacturers: manufacturers.map((m) => m.name),
        error: "Name and category are required",
      });
    }

    try {
      await execute(
        `INSERT INTO agri_products (id, name, category, manufacturer, description, composition, price, unit, recommended_for, usage_instructions, safety_precautions, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
        [
          name,
          category,
          manufacturer,
          description,
          composition,
          price,
          unit || "kg",
          recommendedFor,
          usageInstructions,
          safetyPrecautions,
        ],
      );

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/products?success=created" },
      });
    } catch (e) {
      console.error("Error creating product:", e);
      const manufacturers = await query<{ name: string }>(
        `SELECT DISTINCT name FROM manufacturers WHERE is_active = true`,
        [],
      );
      return ctx.render({
        manufacturers: manufacturers.map((m) => m.name),
        error: "Failed to create product",
      });
    }
  },
};

export default function CreateProductPage(
  { data }: PageProps<CreateProductPageData>,
) {
  const categories = [
    { id: "fertilizer", label: "Fertilizer", desc: "NPK, Urea, DAP, etc." },
    { id: "pesticide", label: "Pesticide", desc: "Insecticides, fungicides" },
    { id: "seed", label: "Seed", desc: "Crop seeds & varieties" },
    { id: "equipment", label: "Equipment", desc: "Farm tools & machinery" },
    { id: "other", label: "Other", desc: "Miscellaneous products" },
  ];

  return (
    <AdminLayout title="Add New Product" currentPage="products">
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg border p-6">
          {data.error && (
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {data.error}
            </div>
          )}

          <form method="POST" class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., DAP Fertilizer"
                />
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <div class="grid grid-cols-3 gap-2">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      class="flex flex-col p-2 border rounded-lg cursor-pointer hover:border-primary-500 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
                    >
                      <input
                        type="radio"
                        name="category"
                        value={c.id}
                        class="sr-only"
                        required
                      />
                      <span class="font-medium text-gray-900 text-sm">
                        {c.label}
                      </span>
                      <span class="text-xs text-gray-500">{c.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Manufacturer
                </label>
                <input
                  type="text"
                  name="manufacturer"
                  list="manufacturers"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Select or enter"
                />
                <datalist id="manufacturers">
                  {data.manufacturers.map((m) => (
                    <option
                      key={m}
                      value={m}
                    />
                  ))}
                </datalist>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Price (₹)
                </label>
                <div class="flex gap-2">
                  <input
                    type="number"
                    name="price"
                    step="0.01"
                    class="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                  />
                  <select name="unit" class="px-3 py-2 border rounded-lg">
                    <option value="kg">per kg</option>
                    <option value="liter">per liter</option>
                    <option value="packet">per packet</option>
                    <option value="unit">per unit</option>
                    <option value="acre">per acre</option>
                  </select>
                </div>
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Product description"
                />
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Composition / Contents
                </label>
                <input
                  type="text"
                  name="composition"
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., N:P:K = 18:46:0"
                />
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Recommended For (Crops)
                </label>
                <p class="text-xs text-gray-500 mb-3">
                  Select crops this product is suitable for. Click category
                  headers to expand/collapse.
                </p>
                <div class="border rounded-lg divide-y max-h-96 overflow-y-auto">
                  {CROP_CATEGORIES.map((category) => (
                    <details key={category.id} class="group">
                      <summary class="flex items-center justify-between px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100 list-none">
                        <div class="flex items-center gap-3">
                          <span class="font-medium text-gray-900">
                            {category.name}
                          </span>
                          <span class="text-xs text-gray-500">
                            ({category.crops.length} crops)
                          </span>
                        </div>
                        <svg
                          class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </summary>
                      <div class="px-4 py-3 bg-white">
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {category.crops.map((crop) => (
                            <label
                              key={crop.id}
                              class="flex items-center gap-2 text-sm p-2 rounded hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                name="recommended_for"
                                value={crop.id}
                                class="rounded text-primary-600 focus:ring-primary-500"
                              />
                              <span class="text-gray-700">{crop.name}</span>
                              <span class="text-xs text-gray-400">
                                {crop.nameHi}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
                <p class="text-xs text-gray-400 mt-2">
                  Total: {CROP_CATEGORIES.reduce(
                    (sum, cat) => sum + cat.crops.length,
                    0,
                  )} crops available
                </p>
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Usage Instructions
                </label>
                <textarea
                  name="usage_instructions"
                  rows={2}
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="How to use this product"
                />
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Safety Precautions
                </label>
                <textarea
                  name="safety_precautions"
                  rows={2}
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Safety warnings and precautions"
                />
              </div>
            </div>

            <div class="flex gap-3 pt-4">
              <a
                href="/admin/products"
                class="flex-1 py-2 border rounded-lg text-center text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </a>
              <button
                type="submit"
                class="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Add Product
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
