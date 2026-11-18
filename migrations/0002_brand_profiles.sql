-- Migration 0002: Add brand_profiles table for multi-tenant support
-- Seeds "مخزن الرحمة" as default active workspace
-- Idempotent: CREATE ... IF NOT EXISTS, safe to replay
--
-- Stores per-tenant brand profiles used for:
-- - Logo contrast guard (light/dark/gold-emerald vs background luminance)
-- - Font family selection (Cairo | Tajawal | IBM Plex Sans Arabic)
-- - Product context notes for light AI market research
-- - Single-tenant active workspace identification

CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(randomhex(16))),
  name TEXT NOT NULL,
  industry TEXT,
  tagline TEXT,
  phone TEXT,
  whatsapp TEXT,
  logo_url TEXT,
  logo_tone TEXT CHECK(logo_tone IN ('light', 'dark', 'gold-emerald')) DEFAULT 'light',
  font_family TEXT CHECK(font_family IN ('Cairo', 'Tajawal', 'IBM Plex Sans Arabic')) DEFAULT 'Cairo',
  product_context_notes TEXT,
  is_active INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  updated_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)
);

-- Insert default "مخزن الرحمة" as the active workspace if not already present
INSERT INTO brand_profiles (id, name, industry, tagline, phone, whatsapp, logo_url, logo_tone, font_family, product_context_notes, is_active, created_at, updated_at)
SELECT 'default-workspace', 'مخزن الرحمة', 'مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل', 'مستحضرات تجميل ومستلزمات الصيدليات - متاح توصيل', '01000017548', 'https://wa.me/201000017548', NULL, 'light', 'منتجات العناية الشخصية والتجميل متوفرة الآن', 1, CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM brand_profiles WHERE id = 'default-workspace');

-- Add index for active workspace lookups
CREATE INDEX IF NOT EXISTS idx_brand_profiles_active ON brand_profiles(is_active);

-- Grant default workspace access pattern
COMMENT ON TABLE brand_profiles IS 'Multi-tenant brand profiles for Al Rahma Warehouse. Seeded with "مخزن الرحمة" as default active workspace. Used for logo contrast guard, font selection, and product context notes.';