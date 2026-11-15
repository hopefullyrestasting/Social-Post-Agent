-- 0002_promos_and_calendar.sql
-- Additive only: new tables for controlled promotions and the cultural calendar.
-- Never touches existing product, brand, research or asset rows.

CREATE TABLE IF NOT EXISTS product_promotions (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  original_price REAL NOT NULL CHECK (original_price > 0),
  discount_percent INTEGER NOT NULL CHECK (
    discount_percent > 0 AND discount_percent < 100
  ),
  promo_price REAL NOT NULL CHECK (promo_price > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_promotions_product
  ON product_promotions(product_id, is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS cultural_calendar (
  id TEXT PRIMARY KEY NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'EG',
  occasion_name_arabic TEXT NOT NULL,
  greeting_text_arabic TEXT NOT NULL,
  occasion_date TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 2 CHECK (lead_days >= 0 AND lead_days <= 30),
  accent_theme TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (country_code, occasion_name_arabic, occasion_date)
);

CREATE INDEX IF NOT EXISTS idx_cultural_calendar_date
  ON cultural_calendar(country_code, is_active, occasion_date);

-- Seed Egyptian national and religious occasions. `INSERT OR IGNORE` keeps
-- this idempotent: re-running the migration never duplicates or overwrites.
INSERT OR IGNORE INTO cultural_calendar
  (id, country_code, occasion_name_arabic, greeting_text_arabic, occasion_date, lead_days, accent_theme, is_active)
VALUES
  ('cc-eg-ramadan', 'EG', 'شهر رمضان الكريم',
   'كل عام وأنتم بخير بمناسبة شهر رمضان الكريم',
   '2027-02-18', 2, 'emerald', 1),
  ('cc-eg-eid-al-fitr', 'EG', 'عيد الفطر المبارك',
   'كل عام وأنتم بخير بمناسبة عيد الفطر المبارك',
   '2027-03-20', 2, 'amber', 1),
  ('cc-eg-eid-al-adha', 'EG', 'عيد الأضحى المبارك',
   'كل عام وأنتم بخير بمناسبة عيد الأضحى المبارك',
   '2027-05-27', 2, 'emerald', 1),
  ('cc-eg-mothers-day', 'EG', 'عيد الأم',
   'كل عام وأنتم بخير بمناسبة عيد الأم',
   '2027-03-21', 2, 'rose', 1),
  ('cc-eg-sham-el-nessim', 'EG', 'شم النسيم',
   'كل عام وأنتم بخير بمناسبة شم النسيم',
   '2027-04-12', 2, 'emerald', 1),
  ('cc-eg-new-year', 'EG', 'العام الجديد',
   'كل عام وأنتم بخير بمناسبة العام الجديد',
   '2027-01-01', 2, 'amber', 1),
  ('cc-eg-october-6', 'EG', 'ذكرى انتصار أكتوبر',
   'كل عام وأنتم بخير بمناسبة ذكرى انتصار أكتوبر',
   '2026-10-06', 2, 'silver', 1);
