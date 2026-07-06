import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { execute, query, queryOne } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";
import { CROP_CATEGORIES } from "$utils/constants.ts";

interface ProductDetail {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  composition: string;
  price: number;
  unit: string;
  recommended_for: string[];
  usage_instructions: string;
  safety_precautions: string;
  is_active: boolean;
}

interface EditProductPageData {
  product: ProductDetail;
  manufacturers: string[];
  success?: string;
  error?: string;
}

export const handler: Handlers<EditProductPageData | null, AuthState> = {
  async GET(req, ctx) {
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

    const productId = ctx.params.id;

    const product = await queryOne<ProductDetail>(
      `SELECT id, name, category, manufacturer, description, composition, price, unit,
              recommended_for, usage_instructions, safety_precautions, is_active
       FROM agri_products WHERE id = $1`,
      [productId],
    );

    if (!product) {
      return ctx.render(null);
    }

    const manufacturers = await query<{ name: string }>(
      `SELECT DISTINCT name FROM manufacturers WHERE is_active = true ORDER BY name`,
      [],
    );

    const url = new URL(req.url);
    const success = url.searchParams.get("success") || undefined;

    return ctx.render({
      product: {
        ...product,
        description: product.description || "",
        composition: product.composition || "",
        manufacturer: product.manufacturer || "",
        unit: product.unit || "kg",
        recommended_for: product.recommended_for || [],
        usage_instructions: product.usage_instructions || "",
        safety_precautions: product.safety_precautions || "",
        price: Number(product.price) || 0,
      },
      manufacturers: manufacturers.map((m) => m.name),
      success,
    });
  },

  async POST(req, ctx) {
    if (
      !ctx.state.session ||
      (ctx.state.user?.role !== "admin" &&
        ctx.state.user?.role !== "tenant_admin")
    ) {
      return new Response(null, { status: 401 });
    }

    const productId = ctx.params.id;
    const formData = await req.formData();
    const action = formData.get("action") as string;

    try {
      if (action === "delete") {
        await execute(`DELETE FROM agri_products WHERE id = $1`, [productId]);
        return new Response(null, {
          status: 302,
          headers: { Location: "/admin/products?success=deleted" },
        });
      }

      if (action === "toggle_active") {
        await execute(
          `UPDATE agri_products SET is_active = NOT is_active WHERE id = $1`,
          [productId],
        );
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/admin/products/${productId}?success=toggled`,
          },
        });
      }

      if (action === "update") {
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
          const product = await queryOne<ProductDetail>(
            `SELECT id, name, category, manufacturer, description, composition, price, unit,
                    recommended_for, usage_instructions, safety_precautions, is_active
             FROM agri_products WHERE id = $1`,
            [productId],
          );
          const manufacturers = await query<{ name: string }>(
            `SELECT DISTINCT name FROM manufacturers WHERE is_active = true ORDER BY name`,
            [],
          );
          return ctx.render({
            product: product
              ? {
                ...product,
                description: product.description || "",
                composition: product.composition || "",
                manufacturer: product.manufacturer || "",
                unit: product.unit || "kg",
                recommended_for: product.recommended_for || [],
                usage_instructions: product.usage_instructions || "",
                safety_precautions: product.safety_precautions || "",
                price: Number(product.price) || 0,
              }
              : null!,
            manufacturers: manufacturers.map((m) => m.name),
            error: "Name and category are required",
          });
        }

        await execute(
          `UPDATE agri_products
           SET name = $1, category = $2, manufacturer = $3, description = $4,
               composition = $5, price = $6, unit = $7, recommended_for = $8,
               usage_instructions = $9, safety_precautions = $10
           WHERE id = $11`,
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
            productId,
          ],
        );

        return new Response(null, {
          status: 302,
          headers: {
            Location: `/admin/products/${productId}?success=updated`,
          },
        });
      }
    } catch (e) {
      console.error("Error updating product:", e);
      const product = await queryOne<ProductDetail>(
        `SELECT id, name, category, manufacturer, description, composition, price, unit,
                recommended_for, usage_instructions, safety_precautions, is_active
         FROM agri_products WHERE id = $1`,
        [productId],
      );
      const manufacturers = await query<{ name: string }>(
        `SELECT DISTINCT name FROM manufacturers WHERE is_active = true ORDER BY name`,
        [],
      );
      return ctx.render({
        product: product
          ? {
            ...product,
            description: product.description || "",
            composition: product.composition || "",
            manufacturer: product.manufacturer || "",
            unit: product.unit || "kg",
            recommended_for: product.recommended_for || [],
            usage_instructions: product.usage_instructions || "",
            safety_precautions: product.safety_precautions || "",
            price: Number(product.price) || 0,
          }
          : null!,
        manufacturers: manufacturers.map((m) => m.name),
        error: "Failed to update product",
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/products/${productId}` },
    });
  },
};

export default function EditProductPage(
  { data }: PageProps<EditProductPageData | null>,
) {
  if (!data) {
    return (
      <AdminLayout title="Product Not Found" currentPage="products">
        <div class="flex items-center justify-center min-h-[50vh]">
          <div class="text-center">
            <h1 class="text-2xl font-bold text-gray-900 mb-2">
              Product Not Found
            </h1>
            <p class="text-gray-500 mb-4">
              The product you're looking for doesn't exist.
            </p>
            <a
              href="/admin/products"
              class="text-primary-600 hover:underline"
            >
              Back to Products
            </a>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const { product, manufacturers } = data;

  const categories = [
    { id: "fertilizer", label: "Fertilizer", desc: "NPK, Urea, DAP, etc." },
    { id: "pesticide", label: "Pesticide", desc: "Insecticides, fungicides" },
    { id: "seed", label: "Seed", desc: "Crop seeds & varieties" },
    { id: "equipment", label: "Equipment", desc: "Farm tools & machinery" },
    { id: "organic", label: "Organic", desc: "Organic farming products" },
    { id: "other", label: "Other", desc: "Miscellaneous products" },
  ];

  return (
    <AdminLayout
      title={`Edit: ${product.name}`}
      currentPage="products"
    >
      <div class="max-w-2xl mx-auto">
        {/* Success Message */}
        {data.success && (
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {data.success === "updated" && "Product updated successfully."}
            {data.success === "toggled" &&
              `Product ${
                product.is_active ? "activated" : "deactivated"
              } successfully.`}
          </div>
        )}

        {/* Error Message */}
        {data.error && (
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {data.error}
          </div>
        )}

        {/* Status & Actions Bar */}
        <div class="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span
                class={`px-3 py-1 rounded-full text-sm font-medium ${
                  product.is_active
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {product.is_active ? "Active" : "Inactive"}
              </span>
              <span class="text-sm text-gray-500">ID: {product.id}</span>
            </div>
            <div class="flex gap-2">
              <form method="POST" class="inline">
                <input type="hidden" name="action" value="toggle_active" />
                <button
                  type="submit"
                  class={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    product.is_active
                      ? "border-red-300 text-red-600 hover:bg-red-50"
                      : "border-green-300 text-green-600 hover:bg-green-50"
                  }`}
                >
                  {product.is_active ? "Deactivate" : "Activate"}
                </button>
              </form>
              <form method="POST">
                <input type="hidden" name="action" value="delete" />
                <button
                  type="submit"
                  class="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div class="bg-white rounded-xl shadow-sm border p-6">
          <form method="POST" class="space-y-6">
            <input type="hidden" name="action" value="update" />

            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={product.name}
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
                        checked={product.category === c.id}
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
                  value={product.manufacturer}
                  class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Select or enter"
                />
                <datalist id="manufacturers">
                  {manufacturers.map((m) => <option key={m} value={m} />)}
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
                    value={product.price}
                    class="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                  />
                  <select name="unit" class="px-3 py-2 border rounded-lg">
                    {["kg", "liter", "packet", "unit", "acre"].map((u) => (
                      <option key={u} value={u} selected={product.unit === u}>
                        per {u}
                      </option>
                    ))}
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
                >
                  {product.description}
                </textarea>
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Composition / Contents
                </label>
                <input
                  type="text"
                  name="composition"
                  value={product.composition}
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
                                checked={product.recommended_for.includes(
                                  crop.id,
                                )}
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
                >
                  {product.usage_instructions}
                </textarea>
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
                >
                  {product.safety_precautions}
                </textarea>
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
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
