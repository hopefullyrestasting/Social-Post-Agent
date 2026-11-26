-- Idempotency and delivery status for Payhip paid-event provisioning.
-- Raw access keys are never stored in this table.
CREATE TABLE IF NOT EXISTS payhip_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  tenant_key_id TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'not_configured')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payhip_webhook_events_tenant
  ON payhip_webhook_events(tenant_key_id);
