import { resolveTenantScope } from "../_tenant";

interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const tenant = scope.tenantId;

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
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE tenant_key_id = ?").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM products").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(DISTINCT brand_id) AS count FROM products WHERE tenant_key_id = ?").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM brands").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE tenant_key_id = ? AND verification_status != 'verified'").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE verification_status != 'verified'").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE tenant_key_id = ? AND verification_status = 'verified'").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE verification_status = 'verified'").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM product_assets WHERE image_type = 'reference' AND image_url IS NOT NULL AND TRIM(image_url) != '' AND tenant_key_id = ?").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM product_assets WHERE image_type = 'reference' AND image_url IS NOT NULL AND TRIM(image_url) != ''").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE tenant_key_id = ?").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM campaigns").first<{ count: number }>(),
      tenant
        ? env.DB.prepare("SELECT COUNT(*) AS count FROM creatives WHERE image_url IS NOT NULL AND TRIM(image_url) != '' AND tenant_key_id = ?").bind(tenant).first<{ count: number }>()
        : env.DB.prepare("SELECT COUNT(*) AS count FROM creatives WHERE image_url IS NOT NULL AND TRIM(image_url) != ''").first<{ count: number }>(),
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
