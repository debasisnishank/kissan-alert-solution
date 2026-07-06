import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { query } from "$db/client.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface Dealer {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  address: string;
  district: string;
  categories: string[];
  rating: number;
  distance: number | null;
}

interface DealersPageData {
  dealers: Dealer[];
  userDistrict: string;
}

export const handler: Handlers<DealersPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    let dealers: Dealer[] = [];
    const userDistrict = "Pune"; // Would come from user's farm location

    try {
      const dealerData = await query<{
        id: string;
        name: string;
        shop_name: string;
        phone: string;
        address: string;
        district: string;
        categories: string[];
        rating: number;
      }>(
        `SELECT id, name, shop_name, phone, address, district, categories, rating
         FROM dealers
         WHERE is_active = true
         ORDER BY rating DESC
         LIMIT 20`,
        [],
      );

      dealers = dealerData.map((d) => ({
        id: d.id,
        name: d.name,
        shopName: d.shop_name,
        phone: d.phone,
        address: d.address,
        district: d.district,
        categories: d.categories || [],
        rating: Number(d.rating) || 0,
        distance: d.district === userDistrict
          ? Math.floor(Math.random() * 10) + 1
          : null,
      }));
    } catch {
      // Use mock dealers
      dealers = getMockDealers(userDistrict);
    }

    return ctx.render({ dealers, userDistrict });
  },
};

function getMockDealers(userDistrict: string): Dealer[] {
  return [
    {
      id: "1",
      name: "Rajesh Patel",
      shopName: "Kisan Agro Centre",
      phone: "9876543210",
      address: "Main Market Road, Near Bus Stand",
      district: userDistrict,
      categories: ["fertilizer", "seed", "pesticide"],
      rating: 4.5,
      distance: 2.5,
    },
    {
      id: "2",
      name: "Suresh Kumar",
      shopName: "New Agri Supplies",
      phone: "9876543211",
      address: "Mandi Road, Opposite Grain Market",
      district: userDistrict,
      categories: ["fertilizer", "equipment"],
      rating: 4.2,
      distance: 4.1,
    },
    {
      id: "3",
      name: "Amit Singh",
      shopName: "Singh Fertilizers",
      phone: "9876543212",
      address: "Industrial Area, Sector 5",
      district: userDistrict,
      categories: ["fertilizer"],
      rating: 4.8,
      distance: 6.3,
    },
    {
      id: "4",
      name: "Priya Sharma",
      shopName: "Green Harvest Seeds",
      phone: "9876543213",
      address: "Agriculture University Road",
      district: userDistrict,
      categories: ["seed", "organic"],
      rating: 4.6,
      distance: 3.2,
    },
  ];
}

export default function DealersPage({ data }: PageProps<DealersPageData>) {
  const { dealers, userDistrict } = data;

  const categoryIcons: Record<string, string> = {
    fertilizer: "🌱",
    seed: "🌾",
    pesticide: "🧪",
    equipment: "🚜",
    organic: "🥬",
  };

  return (
    <AppShell title="Nearby Dealers" showBack>
      {/* Location Banner */}
      <div class="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
        <div class="flex items-center gap-2 text-blue-700 text-sm">
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>
            Showing dealers near <strong>{userDistrict}</strong>
          </span>
        </div>
      </div>

      {/* Dealer List */}
      <div class="space-y-3">
        {dealers.map((dealer) => (
          <div
            key={dealer.id}
            class="bg-white rounded-xl border border-gray-100 p-4"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <h3 class="font-semibold text-gray-900">{dealer.shopName}</h3>
                <p class="text-sm text-gray-500">{dealer.name}</p>
              </div>
              <div class="flex items-center gap-1 px-2 py-1 bg-yellow-50 rounded">
                <svg
                  class="w-4 h-4 text-yellow-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span class="text-sm font-medium text-yellow-700">
                  {dealer.rating.toFixed(1)}
                </span>
              </div>
            </div>

            <p class="text-sm text-gray-600 mb-2">{dealer.address}</p>

            <div class="flex items-center gap-2 mb-3">
              {dealer.categories.map((cat) => (
                <span
                  key={cat}
                  class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 capitalize"
                >
                  {categoryIcons[cat] || ""} {cat}
                </span>
              ))}
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-gray-100">
              {dealer.distance && (
                <span class="text-sm text-gray-500">
                  {dealer.distance} km away
                </span>
              )}
              <div class="flex gap-2">
                <a
                  href={`tel:${dealer.phone}`}
                  class="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-600 rounded-lg text-sm font-medium"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  Call
                </a>
                <a
                  href={`https://wa.me/91${dealer.phone}`}
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-sm font-medium"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {dealers.length === 0 && (
        <div class="text-center py-12">
          <svg
            class="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
          </svg>
          <h3 class="text-lg font-semibold text-gray-900 mb-1">
            No Dealers Found
          </h3>
          <p class="text-sm text-gray-500">
            No dealers available in your area yet
          </p>
        </div>
      )}
    </AppShell>
  );
}
