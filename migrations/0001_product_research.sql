CREATE TABLE IF NOT EXISTS product_information_sources (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_url TEXT NOT NULL,
  source_name TEXT,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('manufacturer', 'regulator', 'retailer', 'other')
  ),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'verified', 'rejected')
  ),
  retrieved_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (product_id, source_url),
  UNIQUE (id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_information_sources_product
  ON product_information_sources(product_id, verification_status);

CREATE TABLE IF NOT EXISTS product_research_claims (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_id TEXT NOT NULL REFERENCES product_information_sources(id),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('benefit', 'usage')),
  claim_text TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'verified', 'rejected')
  ),
  verified_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_id, product_id)
    REFERENCES product_information_sources(id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_research_claims_product
  ON product_research_claims(product_id, claim_type, verification_status);

CREATE TABLE IF NOT EXISTS warehouse_stock_checks (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  stock_status TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  checked_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_checks_product
  ON warehouse_stock_checks(product_id, checked_at DESC);
