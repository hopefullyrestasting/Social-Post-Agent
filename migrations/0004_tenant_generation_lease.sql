-- 0004_tenant_generation_lease.sql
--
-- Phase 2: light anti-abuse protection for generation endpoints.
--
-- Annual-plan tenants have no hard image quota, but a single key must not be
-- able to run overlapping/rapid generation loops that exhaust Workers or
-- external provider capacity. This adds an atomic lease + cooldown using a
-- conditional UPDATE on `activation_keys` (safe across Worker isolates).
--
-- Additive, nullable, no existing row is rewritten.

ALTER TABLE activation_keys ADD COLUMN in_flight_until INTEGER;
ALTER TABLE activation_keys ADD COLUMN last_generation_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_activation_keys_in_flight
  ON activation_keys(in_flight_until);
