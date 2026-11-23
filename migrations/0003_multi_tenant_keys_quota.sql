-- 0003_multi_tenant_keys_quota.sql
--
-- Phase 1 of multi-tenant / per-activation-key support.
--
-- Consolidates the never-applied `0002_brand_profiles.sql` (which used
-- `lower(randomhex(...))` and `COMMENT ON TABLE`, neither of which exist in
-- SQLite/D1) into this single, duplicate-free migration, and adds the tenant
-- key + quota schema.
--
-- Additive only:
--   * No existing table, row, or column is dropped, renamed, or rewritten.
--   * Every CREATE uses IF NOT EXISTS and every index is IF NOT EXISTS, so the
--     file is replay-safe for those statements.
--   * ALTER TABLE ADD COLUMN is intentionally used for the nullable
--     `tenant_key_id` columns. SQLite has no `ADD COLUMN IF NOT EXISTS`, but D1
--     applies each migration exactly once (tracked in `d1_migrations`), so the
--     columns are added once and existing remote rows keep `tenant_key_id = NULL`.
--     Phase 2 backfills the seeded `makhzan-al-rahma` rows to their tenant key.
--
-- Phase 1 deliberately does NOT seed any brand identity/contact values here.
-- Identity stays in `src/lib/al-rahma/brand-core.ts` until Phase 2 introduces
-- tenant provisioning (one-time brand lock) and its explicit seed path.

-- ---------------------------------------------------------------------------
-- 1. Brand profiles (recovered from the duplicate/deferred 0002 migration)
-- ---------------------------------------------------------------------------
-- Shape matches the defensive DDL that previously lived in
-- `functions/api/db/campaigns.ts`, so no schema divergence remains.
CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  tagline TEXT,
  phone TEXT,
  whatsapp TEXT,
  logo_url TEXT,
  logo_tone TEXT NOT NULL DEFAULT 'light'
    CHECK (logo_tone IN ('light', 'dark', 'gold-emerald')),
  font_family TEXT NOT NULL DEFAULT 'Cairo'
    CHECK (font_family IN ('Cairo', 'Tajawal', 'IBM Plex Sans Arabic')),
  product_context_notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  updated_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_active
  ON brand_profiles(is_active);

-- ---------------------------------------------------------------------------
-- 2. Activation keys — one key == one brand-locked tenant workspace
-- ---------------------------------------------------------------------------
-- Only the SHA-256 hex digest of the key is stored. Raw activation keys must
-- never be persisted or logged.
CREATE TABLE IF NOT EXISTS activation_keys (
  id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'exhausted')),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  expires_at INTEGER,

  -- One-time brand lock. Enforced by Phase 2 (API), recorded here.
  brand_locked INTEGER NOT NULL DEFAULT 0 CHECK (brand_locked IN (0, 1)),
  locked_brand_name TEXT,
  locked_industry TEXT,
  locked_logo_url TEXT,
  locked_brand_json TEXT,
  locked_at INTEGER,

  -- Quota counters. Phase 2 owns the atomic increment + exhaustion status.
  quota_total INTEGER NOT NULL DEFAULT 0 CHECK (quota_total >= 0),
  quota_used INTEGER NOT NULL DEFAULT 0 CHECK (quota_used >= 0)
);

CREATE INDEX IF NOT EXISTS idx_activation_keys_status
  ON activation_keys(status);

CREATE INDEX IF NOT EXISTS idx_activation_keys_expires
  ON activation_keys(expires_at);

-- ---------------------------------------------------------------------------
-- 3. Quota ledger — append-only usage/audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quota_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  key_id TEXT NOT NULL,
  action TEXT NOT NULL,
  delta INTEGER NOT NULL,
  campaign_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quota_ledger_key_created
  ON quota_ledger(key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quota_ledger_campaign
  ON quota_ledger(campaign_id);

-- ---------------------------------------------------------------------------
-- 4. Tenant scoping columns (nullable = legacy/global rows)
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN tenant_key_id TEXT;
ALTER TABLE product_assets ADD COLUMN tenant_key_id TEXT;
ALTER TABLE campaigns ADD COLUMN tenant_key_id TEXT;
ALTER TABLE creatives ADD COLUMN tenant_key_id TEXT;
ALTER TABLE product_promotions ADD COLUMN tenant_key_id TEXT;
ALTER TABLE business_settings ADD COLUMN tenant_key_id TEXT;

CREATE INDEX IF NOT EXISTS idx_products_tenant_key
  ON products(tenant_key_id);

CREATE INDEX IF NOT EXISTS idx_product_assets_tenant_key
  ON product_assets(tenant_key_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_key
  ON campaigns(tenant_key_id);

CREATE INDEX IF NOT EXISTS idx_creatives_tenant_key
  ON creatives(tenant_key_id);

CREATE INDEX IF NOT EXISTS idx_product_promotions_tenant_key
  ON product_promotions(tenant_key_id);

CREATE INDEX IF NOT EXISTS idx_business_settings_tenant_key
  ON business_settings(tenant_key_id);

-- NOTE for Phase 2:
--   * `business_settings.key` is still the PRIMARY KEY, so per-tenant setting
--     rows with the same `key` will collide. Phase 2 should introduce a
--     composite (tenant_key_id, key) model or tenant-prefixed keys.
--   * Existing `makhzan-al-rahma` rows remain readable because every new
--     column is nullable and no existing query filters on it yet.
