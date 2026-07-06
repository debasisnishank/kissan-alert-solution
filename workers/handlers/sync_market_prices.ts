/**
 * Market Price Sync Handler
 * Fetches real market prices from Agmarknet and syncs to database
 */

import { execute } from "$db/client.ts";
import { getAgmarknetPrices } from "$lib/satellite/market.ts";

interface SyncMarketPricesPayload {
  commodity?: string;
  state?: string;
  limit?: number;
}

export async function handleSyncMarketPrices(
  payload: SyncMarketPricesPayload,
): Promise<{
  pricesFetched: number;
  pricesInserted: number;
}> {
  console.log("[JOB] Syncing market prices...");

  const { commodity, state, limit = 500 } = payload;

  // Fetch prices from Agmarknet
  const prices = await getAgmarknetPrices({
    commodity,
    state,
    limit,
  });

  console.log(`[JOB] Fetched ${prices.length} prices from Agmarknet`);

  let inserted = 0;

  for (const price of prices) {
    try {
      await execute(
        `INSERT INTO market_prices (
          crop, mandi_name, district, state, min_price, max_price, modal_price, price_date, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (crop, mandi_name, price_date) DO UPDATE SET
          min_price = EXCLUDED.min_price,
          max_price = EXCLUDED.max_price,
          modal_price = EXCLUDED.modal_price`,
        [
          price.commodity.toLowerCase(),
          price.market,
          price.district,
          price.state,
          price.minPrice,
          price.maxPrice,
          price.modalPrice,
          price.arrivalDate,
          "agmarknet",
        ],
      );
      inserted++;
    } catch (error) {
      console.error(
        `Failed to insert price for ${price.commodity} at ${price.market}:`,
        error,
      );
    }
  }

  console.log(
    `[JOB] Market price sync complete: ${inserted}/${prices.length} prices inserted`,
  );

  return {
    pricesFetched: prices.length,
    pricesInserted: inserted,
  };
}

/**
 * Sync prices for all major commodities in specified states
 */
export async function syncAllMarketPrices(): Promise<{
  totalFetched: number;
  totalInserted: number;
}> {
  const states = [
    "Maharashtra",
    "Madhya Pradesh",
    "Gujarat",
    "Rajasthan",
    "Karnataka",
  ];

  const commodities = [
    "soybean",
    "cotton",
    "wheat",
    "rice",
    "maize",
    "groundnut",
  ];

  let totalFetched = 0;
  let totalInserted = 0;

  for (const state of states) {
    for (const commodity of commodities) {
      try {
        const result = await handleSyncMarketPrices({
          commodity,
          state,
          limit: 50,
        });
        totalFetched += result.pricesFetched;
        totalInserted += result.pricesInserted;
      } catch (error) {
        console.error(
          `Failed to sync ${commodity} prices for ${state}:`,
          error,
        );
      }
    }
  }

  return { totalFetched, totalInserted };
}
