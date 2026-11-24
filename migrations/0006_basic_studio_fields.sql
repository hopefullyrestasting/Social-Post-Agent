-- 0006_basic_studio_fields.sql
-- Basic Studio: optional, operator-owned product fields.
--
-- Additive and backward compatible. Cloudflare D1 applies each migration file
-- exactly once; do not edit or re-apply an already-applied migration. Columns
-- are nullable so existing rows stay untouched and absent values render as
-- absent in creatives (never as invented prices or offers).
--
-- Apply once to the remote database with:
--   npx wrangler d1 migrations apply makhzan-al-rahma --remote

ALTER TABLE products ADD COLUMN offer_text TEXT;
ALTER TABLE products ADD COLUMN sales_line TEXT;

CREATE INDEX IF NOT EXISTS idx_products_basic_queue
  ON products(tenant_key_id, last_advertised_at, created_at, id);
