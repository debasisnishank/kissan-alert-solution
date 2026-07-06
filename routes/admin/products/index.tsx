import { Handlers, PageProps } from "$fresh/server.ts";
import { AdminLayout } from "$components/AdminLayout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface ProductData {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  price: number;
  unit: string;
  isActive: boolean;
  recommendedFor: string[];
}

interface ProductsPageData {
  products: ProductData[];
  manufacturers: string[];
  stats: {
    total: number;
    fertilizers: number;
    pesticides: number;
    seeds: number;
  };
  filter: string;
}

export const handler: Handlers<ProductsPageData, AuthState> = {
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

    const url = new URL(req.url);
    const filter = url.searchParams.get("category") || "all";

    const params: unknown[] = [];
    let whereClause = "";
    if (filter !== "all") {
      whereClause = "WHERE category = $1";
      params.push(filter);
    }

    const products = await query<{
      id: string;
      name: string;
      category: string;
      manufacturer: string;
      description: string;
      price: number;
      unit: string;
      is_active: boolean;
      recommended_for: string[];
    }>(
      `SELECT id, name, category, manufacturer, description, price, unit, is_active, recommended_for
       FROM agri_products ${whereClause}
       ORDER BY name ASC`,
      params,
    );

    const stats = await query<{ category: string; count: number }>(
      `SELECT category, COUNT(*) as count FROM agri_products GROUP BY category`,
      [],
    );

    const manufacturers = await query<{ manufacturer: string }>(
      `SELECT DISTINCT manufacturer FROM agri_products WHERE manufacturer IS NOT NULL ORDER BY manufacturer`,
      [],
    );

    const statsMap: Record<string, number> = {};
    stats.forEach((s) => {
      statsMap[s.category] = Number(s.count);
    });

    return ctx.render({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        manufacturer: p.manufacturer || "Unknown",
        description: p.description || "",
        price: Number(p.price) || 0,
        unit: p.unit || "unit",
        isActive: p.is_active,
        recommendedFor: p.recommended_for || [],
      })),
      manufacturers: manufacturers.map((m) => m.manufacturer),
      stats: {
        total: products.length,
        fertilizers: statsMap["fertilizer"] || 0,
        pesticides: statsMap["pesticide"] || 0,
        seeds: statsMap["seed"] || 0,
      },
      filter,
    });
  },
};

export default function AdminProductsPage(
  { data }: PageProps<ProductsPageData>,
) {
  const { products, stats, filter } = data;

  const categoryColors: Record<string, string> = {
    fertilizer: "bg-green-100 text-green-700",
    pesticide: "bg-red-100 text-red-700",
    seed: "bg-blue-100 text-blue-700",
    equipment: "bg-purple-100 text-purple-700",
    other: "bg-gray-100 text-gray-700",
  };

  return (
    <AdminLayout title="Agri Products" currentPage="products">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">
            Manage fertilizers, pesticides, seeds & equipment
          </p>
          <div class="flex gap-2">
            <a
              href="/admin/manufacturers"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Manufacturers
            </a>
            <a
              href="/admin/products/create"
              class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              + Add Product
            </a>
          </div>
        </div>
        {/* Stats */}
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Total Products</p>
            <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Fertilizers</p>
            <p class="text-2xl font-bold text-green-600">
              {stats.fertilizers}
            </p>
          </div>
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Pesticides</p>
            <p class="text-2xl font-bold text-red-600">{stats.pesticides}</p>
          </div>
          <div class="bg-white rounded-lg border p-4">
            <p class="text-sm text-gray-500">Seeds</p>
            <p class="text-2xl font-bold text-blue-600">{stats.seeds}</p>
          </div>
        </div>

        {/* Filters */}
        <div class="flex gap-2 mb-4">
          {["all", "fertilizer", "pesticide", "seed", "equipment"].map((
            c,
          ) => (
            <a
              key={c}
              href={`/admin/products?category=${c}`}
              class={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                filter === c
                  ? "bg-primary-600 text-white"
                  : "bg-white border text-gray-700"
              }`}
            >
              {c === "all" ? "All" : c + "s"}
            </a>
          ))}
        </div>

        {/* Products Grid */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.length > 0
            ? (
              products.map((product) => (
                <div key={product.id} class="bg-white rounded-lg border p-4">
                  <div class="flex items-start justify-between mb-2">
                    <div>
                      <h3 class="font-semibold text-gray-900">
                        {product.name}
                      </h3>
                      <p class="text-sm text-gray-500">
                        {product.manufacturer}
                      </p>
                    </div>
                    <span
                      class={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        categoryColors[product.category]
                      }`}
                    >
                      {product.category}
                    </span>
                  </div>
                  <p class="text-sm text-gray-600 mb-2 line-clamp-2">
                    {product.description}
                  </p>
                  <div class="flex items-center justify-between">
                    <p class="text-lg font-bold text-primary-600">
                      ₹{product.price}/{product.unit}
                    </p>
                    <a
                      href={`/admin/products/${product.id}`}
                      class="text-sm text-primary-600 hover:underline"
                    >
                      Edit
                    </a>
                  </div>
                  {product.recommendedFor.length > 0 && (
                    <div class="mt-2 flex flex-wrap gap-1">
                      {product.recommendedFor.slice(0, 3).map((crop) => (
                        <span
                          key={crop}
                          class="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 capitalize"
                        >
                          {crop}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )
            : (
              <div class="col-span-full bg-white rounded-lg border p-8 text-center">
                <p class="text-gray-500">No products found</p>
                <a
                  href="/admin/products/create"
                  class="text-primary-600 text-sm mt-2 inline-block"
                >
                  Add your first product
                </a>
              </div>
            )}
        </div>
      </div>
    </AdminLayout>
  );
}
