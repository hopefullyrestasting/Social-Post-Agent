interface Env {
  DB: D1Database;
}

interface ProductIdentity {
  id: string;
  name_arabic: string;
  name_english: string | null;
  category: string | null;
  subcategory: string | null;
  packaging_size: string | null;
  variant: string | null;
  verification_status: string;
  brand_arabic: string;
  brand_english: string | null;
  brand_slug: string;
}

interface ResearchClaim {
  id: string;
  source_id: string;
  source_name: string | null;
  source_url: string;
  source_verification_status: string;
  claim_type: "benefit" | "usage";
  claim_text: string;
  verification_status: string;
  verified_at: number | null;
  notes: string | null;
}

interface ReferenceImage {
  id: string;
  image_url: string | null;
  source_url: string | null;
  image_type: string | null;
  verification_status: string | null;
  is_primary: number;
}

interface InformationSource {
  id: string;
  source_url: string;
  source_name: string | null;
  source_type: string;
  verification_status: string;
  retrieved_at: number | null;
  notes: string | null;
}

interface StockCheck {
  id: string;
  stock_status: string;
  checked_at: number;
  checked_by: string | null;
  notes: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const productId = new URL(request.url).searchParams.get("product_id")?.trim();
  if (!productId || productId.length > 100) {
    return Response.json(
      { success: false, error: "A valid product_id is required." },
      { status: 400 },
    );
  }

  try {
    const [product, images, sources, claims, stockChecks] = await Promise.all([
      env.DB.prepare(`
        SELECT p.id, p.name_arabic, p.name_english, p.category, p.subcategory,
               p.packaging_size, p.variant, p.verification_status,
               b.name_arabic AS brand_arabic, b.name_english AS brand_english,
               b.slug AS brand_slug
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        WHERE p.id = ?
      `)
        .bind(productId)
        .first<ProductIdentity>(),
      env.DB.prepare(`
        SELECT id, image_url, source_url, image_type, verification_status, is_primary
        FROM product_assets
        WHERE product_id = ? AND image_type = 'reference'
        ORDER BY is_primary DESC, retrieved_at DESC
      `)
        .bind(productId)
        .all<ReferenceImage>(),
      env.DB.prepare(`
        SELECT id, source_url, source_name, source_type, verification_status,
               retrieved_at, notes
        FROM product_information_sources
        WHERE product_id = ?
        ORDER BY retrieved_at DESC, created_at DESC
      `)
        .bind(productId)
        .all<InformationSource>(),
      env.DB.prepare(`
        SELECT c.id, c.source_id, s.source_name, s.source_url,
               s.verification_status AS source_verification_status, c.claim_type,
               c.claim_text, c.verification_status, c.verified_at, c.notes
        FROM product_research_claims c
        JOIN product_information_sources s
          ON s.id = c.source_id AND s.product_id = c.product_id
        WHERE c.product_id = ?
        ORDER BY c.claim_type, c.created_at DESC
      `)
        .bind(productId)
        .all<ResearchClaim>(),
      env.DB.prepare(`
        SELECT id, stock_status, checked_at, checked_by, notes
        FROM warehouse_stock_checks
        WHERE product_id = ?
        ORDER BY checked_at DESC
        LIMIT 20
      `)
        .bind(productId)
        .all<StockCheck>(),
    ]);

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found." },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      research: {
        product,
        referenceImages: images.results,
        informationSources: sources.results,
        verifiedBenefits: claims.results.filter(
        (claim) =>
          claim.claim_type === "benefit" &&
            claim.verification_status === "verified" &&
            claim.source_verification_status === "verified",
        ),
        verifiedUsage: claims.results.filter(
          (claim) =>
            claim.claim_type === "usage" &&
            claim.verification_status === "verified" &&
            claim.source_verification_status === "verified",
        ),
        unverifiedClaims: claims.results.filter(
          (claim) =>
            claim.verification_status !== "verified" ||
            claim.source_verification_status !== "verified",
        ),
        stockChecks: stockChecks.results,
        latestStockStatus: stockChecks.results[0]?.stock_status ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to load product research from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load product research from D1." },
      { status: 500 },
    );
  }
};
