interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [
      products,
      brands,
      needsVerification,
      verified,
      referenceImages,
      campaigns,
      generatedImages,
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM products").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM brands").first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM products WHERE verification_status != 'verified'",
      ).first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM products WHERE verification_status = 'verified'",
      ).first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM product_assets WHERE image_type = 'reference' AND image_url IS NOT NULL AND TRIM(image_url) != ''",
      ).first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM campaigns").first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM creatives WHERE image_url IS NOT NULL AND TRIM(image_url) != ''",
      ).first<{ count: number }>(),
    ]);

    return Response.json(
      {
        success: true,
        stats: {
          products: products?.count ?? 0,
          brands: brands?.count ?? 0,
          needsVerification: needsVerification?.count ?? 0,
          verified: verified?.count ?? 0,
          referenceImages: referenceImages?.count ?? 0,
          campaigns: campaigns?.count ?? 0,
          generatedImages: generatedImages?.count ?? 0,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Failed to load Al Rahma dashboard statistics from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load dashboard statistics from D1." },
      { status: 500 },
    );
  }
};
