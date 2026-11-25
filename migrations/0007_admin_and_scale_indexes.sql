-- Admin listing and non-repeating tenant queue indexes.
-- Additive only: safe for both local and remote D1 execution when explicitly approved.
CREATE INDEX IF NOT EXISTS idx_products_tenant_queue
  ON products (tenant_key_id, last_advertised_at, created_at, id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_created
  ON products (tenant_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activation_keys_status_expiry
  ON activation_keys (status, expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_activation_keys_label
  ON activation_keys (label);
