/**
 * GET /api/db/campaigns
 *
 * Lists recent campaigns with their generated creatives from D1.
 * Read-only; no writes.
 */

import { resolveTenantScope } from "../_tenant";

interface Env {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

interface CampaignRow {
  id: string;
  campaign_date: string;
  status: string;
  selected_product_ids: string | null;
  total_products: number | null;
  total_images: number | null;
  started_at: number | null;
  completed_at: number | null;
  error_summary: string | null;
  created_at: number | null;
}

interface CreativeRow {
  id: string;
  product_id: string;
  campaign_id: string | null;
  variant_number: number | null;
  image_url: string | null;
  storage_key: string | null;
  style_id: string | null;
  headline_arabic: string | null;
  copy_arabic: string | null;
  quality_status: string | null;
  quality_notes: string | null;
  created_at: number | null;
  product_name_arabic: string | null;
  brand_arabic: string | null;
  brand_slug: string | null;
}

function clampLimit(value: string | null): number | null {
  if (value === null) return 20;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) return null;
  return parsed;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  if (limit === null) {
    return Response.json(
      { success: false, error: "limit must be an integer between 1 and 50." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // `brand_profiles` is created by `migrations/0003_multi_tenant_keys_quota.sql`.
  // Schema changes must not run from a read-only GET handler.
  try {
    const campaigns = await env.DB.prepare(
      `SELECT id, campaign_date, status, selected_product_ids,
              total_products, total_images, started_at, completed_at,
              error_summary, created_at
       FROM campaigns
       ${scope.tenantId ? "WHERE tenant_key_id = ?" : ""}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(...(scope.tenantId ? [scope.tenantId, limit] : [limit]))
      .all<CampaignRow>();

    if (campaigns.results.length === 0) {
      return Response.json(
        { success: true, campaigns: [] },
        { headers: NO_STORE_HEADERS },
      );
    }

    const ids = campaigns.results.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const creatives = await env.DB.prepare(
      `SELECT c.id, c.product_id, c.campaign_id, c.variant_number,
              c.image_url, c.storage_key, c.style_id, c.headline_arabic,
              c.copy_arabic, c.quality_status, c.quality_notes, c.created_at,
              p.name_arabic AS product_name_arabic,
              b.name_arabic AS brand_arabic,
              b.slug AS brand_slug
       FROM creatives c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE c.campaign_id IN (${placeholders})
       ${scope.tenantId ? "AND c.tenant_key_id = ?" : ""}
        ORDER BY c.campaign_id, c.product_id, c.variant_number`,
    )
      .bind(...(scope.tenantId ? [...ids, scope.tenantId] : ids))
      .all<CreativeRow>();

    const creativesByCampaign = new Map<string, CreativeRow[]>();
    for (const creative of creatives.results) {
      const key = creative.campaign_id ?? "";
      const bucket = creativesByCampaign.get(key) ?? [];
      bucket.push(creative);
      creativesByCampaign.set(key, bucket);
    }

    return Response.json(
      {
        success: true,
        campaigns: campaigns.results.map((campaign) => ({
          ...campaign,
          creatives: creativesByCampaign.get(campaign.id) ?? [],
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load campaigns from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load campaigns from D1." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
};
