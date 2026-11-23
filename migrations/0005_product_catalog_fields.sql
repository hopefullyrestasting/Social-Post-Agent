-- 0005_product_catalog_fields.sql
-- Phase 3: optional catalog fields for tenant-ingested products.
-- Additive, nullable, backward compatible.

ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN price REAL;

CREATE INDEX IF NOT EXISTS idx_products_sku
  ON products(sku);

CREATE INDEX IF NOT EXISTS idx_products_tenant_sku
  ON products(tenant_key_id, sku);
