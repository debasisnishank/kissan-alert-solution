-- Migration 010: Production Fixes
-- 1. Widen phone column from VARCHAR(15) to VARCHAR(20) to support generated phone numbers
-- 2. Add unique constraint on market_prices(crop, mandi_name, price_date) for ON CONFLICT

-- Widen phone column
ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(20);

-- Add unique constraint for market prices upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_prices_unique
  ON market_prices(crop, mandi_name, price_date);
