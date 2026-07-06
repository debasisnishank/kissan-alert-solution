import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface MarketPageData {
  prices: Array<{
    crop: string;
    mandiName: string;
    district: string;
    minPrice: number;
    maxPrice: number;
    modalPrice: number;
    priceDate: string;
    trend: "up" | "down" | "stable";
  }>;
  selectedCrop: string;
}

export const handler: Handlers<MarketPageData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const url = new URL(req.url);
    const selectedCrop = url.searchParams.get("crop") || "all";

    let whereClause = "1=1";
    const params: unknown[] = [];

    if (selectedCrop !== "all") {
      params.push(selectedCrop);
      whereClause = `crop = $${params.length}`;
    }

    const prices = await query<{
      crop: string;
      mandi_name: string;
      district: string;
      min_price: number;
      max_price: number;
      modal_price: number;
      price_date: Date;
    }>(
      `SELECT crop, mandi_name, district, min_price, max_price, modal_price, price_date
       FROM market_prices
       WHERE ${whereClause}
       ORDER BY price_date DESC, crop
       LIMIT 50`,
      params,
    );

    return ctx.render({
      prices: prices.map((p) => ({
        crop: p.crop,
        mandiName: p.mandi_name,
        district: p.district,
        minPrice: Number(p.min_price),
        maxPrice: Number(p.max_price),
        modalPrice: Number(p.modal_price),
        priceDate: new Date(p.price_date).toLocaleDateString("en-IN"),
        trend: (p as { trend?: string }).trend as "up" | "down" | "stable" ||
          "stable",
      })),
      selectedCrop,
    });
  },
};

export default function MarketPage({ data }: PageProps<MarketPageData>) {
  const { prices, selectedCrop } = data;

  const crops = ["all", "soybean", "cotton", "wheat", "rice", "maize"];
  const cropLabels: Record<string, string> = {
    all: "All Crops",
    soybean: "Soybean",
    cotton: "Cotton",
    wheat: "Wheat",
    rice: "Rice",
    maize: "Maize",
  };

  return (
    <AppShell title="Market Prices" showBack>
      {/* Crop Filter */}
      <div class="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
        {crops.map((crop) => (
          <a
            key={crop}
            href={`/app/market?crop=${crop}`}
            class={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedCrop === crop
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cropLabels[crop]}
          </a>
        ))}
      </div>

      {/* Price Cards */}
      {prices.length > 0
        ? (
          <div class="space-y-3">
            {prices.map((price, idx) => (
              <div
                key={idx}
                class="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <h3 class="font-semibold text-gray-900 capitalize">
                      {price.crop}
                    </h3>
                    <p class="text-sm text-gray-500">
                      {price.mandiName}, {price.district}
                    </p>
                  </div>
                  <div
                    class={`flex items-center gap-1 text-sm font-medium ${
                      price.trend === "up"
                        ? "text-green-600"
                        : price.trend === "down"
                        ? "text-red-600"
                        : "text-gray-500"
                    }`}
                  >
                    {price.trend === "up" && "↑"}
                    {price.trend === "down" && "↓"}
                    {price.trend === "stable" && "→"}
                  </div>
                </div>
                <div class="flex items-end justify-between">
                  <div>
                    <p class="text-2xl font-bold text-gray-900">
                      ₹{price.modalPrice.toLocaleString()}
                    </p>
                    <p class="text-xs text-gray-500">per quintal</p>
                  </div>
                  <div class="text-right text-sm">
                    <p class="text-gray-500">Range</p>
                    <p class="font-medium">
                      ₹{price.minPrice.toLocaleString()}{" "}
                      - ₹{price.maxPrice.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p class="text-xs text-gray-400 mt-2">{price.priceDate}</p>
              </div>
            ))}
          </div>
        )
        : (
          <div class="text-center py-12">
            <p class="text-gray-500">No price data available</p>
          </div>
        )}
    </AppShell>
  );
}
