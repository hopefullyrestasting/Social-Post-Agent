-- Baseline schema for the Al Rahma D1 database (makhzan-al-rahma).
--
-- Captured from the remote database's sqlite_master on 2026-11-15 so that the
-- existing production schema is reproducible from source control.
--
-- This migration is intentionally additive and idempotent: every statement uses
-- IF NOT EXISTS, so it is a no-op against the current production database and
-- safe to replay. It does not create, update, or delete rows.
--
-- Excluded from this baseline:
--   - _cf_KV        (Cloudflare-managed internal table)
--   - sqlite_*      (SQLite internal tables)
--   - d1_migrations (Wrangler migration bookkeeping; created by Wrangler)

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name_arabic TEXT NOT NULL,
  name_english TEXT,
  slug TEXT NOT NULL UNIQUE,
  identity_status TEXT NOT NULL DEFAULT 'needs_verification',
  official_website TEXT,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS business_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  name_arabic TEXT NOT NULL,
  name_english TEXT,
  category TEXT,
  subcategory TEXT,
  packaging_size TEXT,
  variant TEXT,
  egypt_market_status TEXT DEFAULT 'unknown',
  warehouse_stock_status TEXT DEFAULT 'unknown',
  verification_status TEXT NOT NULL DEFAULT 'needs_verification',
  confidence_score REAL DEFAULT 0,
  last_researched_at INTEGER,
  last_advertised_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

CREATE INDEX IF NOT EXISTS idx_products_verification
  ON products(verification_status);

CREATE INDEX IF NOT EXISTS idx_products_last_advertised
  ON products(last_advertised_at);

CREATE TABLE IF NOT EXISTS product_assets (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  image_url TEXT,
  source_url TEXT,
  storage_key TEXT,
  image_type TEXT DEFAULT 'reference',
  verification_status TEXT DEFAULT 'unverified',
  is_primary INTEGER DEFAULT 0,
  retrieved_at INTEGER
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  campaign_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  selected_product_ids TEXT,
  total_products INTEGER DEFAULT 0,
  total_images INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  error_summary TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS creatives (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  campaign_id TEXT REFERENCES campaigns(id),
  variant_number INTEGER DEFAULT 1,
  image_url TEXT,
  storage_key TEXT,
  style_id TEXT,
  headline_arabic TEXT,
  copy_arabic TEXT,
  quality_status TEXT DEFAULT 'pending',
  quality_notes TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_creatives_product ON creatives(product_id);

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON creatives(campaign_id);
