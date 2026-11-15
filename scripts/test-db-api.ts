import assert from "node:assert/strict";
import {
  onRequestGet as getBrands,
} from "../functions/api/db/brands";
import {
  onRequestGet as getProducts,
} from "../functions/api/db/products";
import {
  onRequestGet as getResearch,
} from "../functions/api/db/research";
import {
  onRequestGet as getStats,
} from "../functions/api/db/stats";

type BoundValue = string | number;

class MockStatement {
  values: BoundValue[] = [];

  constructor(
    readonly sql: string,
    private readonly database: MockDatabase,
  ) {}

  bind(...values: BoundValue[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("COUNT(*)") && this.sql.includes("products")) {
      return { count: 177 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("brands")) {
      return { count: 7 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("product_assets")) {
      return { count: 0 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("campaigns")) {
      return { count: 0 } as T;
    }
    if (this.sql.includes("COUNT(*)") && this.sql.includes("creatives")) {
      return { count: 0 } as T;
    }
    if (this.sql.includes("WHERE p.id = ?")) {
      return this.values[0] === "product-1"
        ? ({
            id: "product-1",
            name_arabic: "منتج العناية",
            name_english: "Care product",
            category: "hair_care",
            subcategory: null,
            packaging_size: null,
            variant: null,
            verification_status: "needs_verification",
            brand_arabic: "فاتيكا",
            brand_english: "Vatika",
            brand_slug: "vatika",
          } as T)
        : null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    if (this.sql.includes("COUNT(p.id) AS product_count")) {
      return {
        results: [
          {
            id: "brand-1",
            name_arabic: "فاتيكا",
            name_english: "Vatika",
            slug: "vatika",
            identity_status: "verified",
            product_count: 47,
          } as T,
        ],
      };
    }
    if (this.sql.includes("SELECT DISTINCT category")) {
      return { results: [{ category: "shampoo" } as T] };
    }
    if (this.sql.includes("FROM products p") && this.sql.includes("LIMIT ? OFFSET ?")) {
      return {
        results: [
          {
            id: "product-1",
            name_arabic: "شامبو",
            name_english: null,
            category: "shampoo",
            subcategory: null,
            packaging_size: null,
            variant: null,
            egypt_market_status: "unknown",
            warehouse_stock_status: "unknown",
            verification_status: "needs_verification",
            confidence_score: 0,
            brand_arabic: "فاتيكا",
            brand_english: "Vatika",
            brand_slug: "vatika",
            image_url: null,
            image_source: null,
          } as T,
        ],
      };
    }
    if (this.sql.includes("FROM product_assets")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_information_sources")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM product_research_claims")) {
      return {
        results: [
          {
            id: "benefit-verified",
            source_id: "source-verified",
            source_name: "Official source",
            source_url: "https://example.test/official",
            source_verification_status: "verified",
            claim_type: "benefit",
            claim_text: "Verified benefit",
            verification_status: "verified",
            verified_at: 1,
            notes: null,
          },
          {
            id: "usage-verified",
            source_id: "source-verified",
            source_name: "Official source",
            source_url: "https://example.test/official",
            source_verification_status: "verified",
            claim_type: "usage",
            claim_text: "Verified usage",
            verification_status: "verified",
            verified_at: 1,
            notes: null,
          },
          {
            id: "usage-unverified",
            source_id: "source-unverified",
            source_name: "Unverified source",
            source_url: "https://example.test/unverified",
            source_verification_status: "unverified",
            claim_type: "usage",
            claim_text: "Unverified usage",
            verification_status: "unverified",
            verified_at: null,
            notes: null,
          },
        ] as T[],
      };
    }
    if (this.sql.includes("FROM warehouse_stock_checks")) {
      return { results: [] };
    }
    return { results: [] };
  }
}

class MockDatabase {
  calls: { sql: string; values: BoundValue[] }[] = [];

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }
}

function context(database: MockDatabase, url: string) {
  return {
    request: new Request(url),
    env: { DB: database as unknown as D1Database },
  } as unknown as Parameters<typeof getProducts>[0];
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function run() {
  const database = new MockDatabase();
  const filteredResponse = await getProducts(
    context(
      database,
      "https://example.test/api/db/products?q=shampoo&brand=vatika&status=needs_verification&category=shampoo&limit=50&offset=50",
    ),
  );
  const filtered = await json(filteredResponse);

  assert.equal(filteredResponse.status, 200);
  assert.equal(filtered.total, 177);
  assert.equal(filtered.limit, 50);
  assert.equal(filtered.offset, 50);
  assert.equal(filtered.hasMore, true);

  const pageQuery = database.calls.find((call) =>
    call.sql.includes("LIMIT ? OFFSET ?"),
  );
  assert.ok(pageQuery);
  assert.deepEqual(pageQuery.values, [
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "%shampoo%",
    "vatika",
    "needs_verification",
    "shampoo",
    50,
    50,
  ]);
  assert.ok(pageQuery.sql.includes("pa.image_type = 'reference'"));

  const invalidDatabase = new MockDatabase();
  const invalidResponse = await getProducts(
    context(invalidDatabase, "https://example.test/api/db/products?limit=500"),
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidDatabase.calls.length, 0);

  const statsResponse = await getStats(
    context(new MockDatabase(), "https://example.test/api/db/stats"),
  );
  const stats = await json(statsResponse);
  assert.equal(statsResponse.status, 200);
  assert.equal((stats.stats as { products: number }).products, 177);

  const brandsResponse = await getBrands(
    context(new MockDatabase(), "https://example.test/api/db/brands"),
  );
  const brands = await json(brandsResponse);
  assert.equal(brandsResponse.status, 200);
  assert.equal((brands.brands as unknown[]).length, 1);

  const researchDatabase = new MockDatabase();
  const researchResponse = await getResearch(
    context(
      researchDatabase,
      "https://example.test/api/db/research?product_id=product-1",
    ),
  );
  const research = await json(researchResponse);
  assert.equal(researchResponse.status, 200);
  assert.equal(
    (research.research as { product: { id: string } }).product.id,
    "product-1",
  );
  assert.ok(
    researchDatabase.calls.some((call) =>
      call.sql.includes("s.id = c.source_id AND s.product_id = c.product_id"),
    ),
  );
  const researchPayload = research.research as {
    verifiedBenefits: { id: string }[];
    verifiedUsage: { id: string }[];
    unverifiedClaims: { id: string }[];
  };
  assert.deepEqual(
    researchPayload.verifiedBenefits.map((claim) => claim.id),
    ["benefit-verified"],
  );
  assert.deepEqual(
    researchPayload.verifiedUsage.map((claim) => claim.id),
    ["usage-verified"],
  );
  assert.deepEqual(
    researchPayload.unverifiedClaims.map((claim) => claim.id),
    ["usage-unverified"],
  );
  assert.ok(
    researchDatabase.calls.some(
      (call) =>
        call.sql.includes("FROM product_assets") &&
        call.sql.includes("image_type = 'reference'"),
    ),
  );

  const missingProductResponse = await getResearch(
    context(
      new MockDatabase(),
      "https://example.test/api/db/research?product_id=not-found",
    ),
  );
  assert.equal(missingProductResponse.status, 404);

  console.log("D1 API tests passed: pagination, filters, input validation, stats, brands, and product research.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
