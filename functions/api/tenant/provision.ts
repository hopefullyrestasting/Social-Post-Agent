import { z } from "zod";
import { authorizeAdminRequest } from "../_auth";
import {
  annualExpiryFrom,
  hashAccessKey,
  nowSeconds,
  tenantFromRow,
  tenantMePayload,
  type ActivationKeyRow,
  type TenantEnv,
} from "../_tenant";

/**
 * POST /api/tenant/provision  (admin-only)
 *
 * Creates one annual activation key. The raw key is returned exactly once and
 * only its SHA-256 digest is persisted.
 *
 * `adoptLegacyData: true` claims unassigned (tenant_key_id IS NULL) rows for
 * the new key. It never touches rows already owned by another tenant.
 */

interface ProvisionEnv extends TenantEnv {
  ADMIN_API_KEY?: string;
}

const schema = z
  .object({
    label: z.string().trim().max(120).optional(),
    expires_at: z.union([z.string().trim().max(40), z.number().finite()]).optional(),
    quota_total: z.number().int().min(0).max(1_000_000_000).optional(),
    adoptLegacyData: z.boolean().optional(),
  })
  .strict();

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `arh_${hex}`;
}

function parseExpiry(value: string | number | undefined): number {
  const now = nowSeconds();
  if (value === undefined) return annualExpiryFrom(now);

  if (typeof value === "number") {
    const seconds = value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
    return Math.floor(seconds);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return Number.NaN;
  return Math.floor(parsed / 1000);
}

export const onRequestPost: PagesFunction<ProvisionEnv> = async ({
  request,
  env,
}) => {
  const configuredAdminKey = (env.ADMIN_API_KEY ?? "").trim();
  if (!configuredAdminKey) {
    return Response.json(
      {
        success: false,
        code: "admin_key_unconfigured",
        error:
          "Provisioning is disabled until ADMIN_API_KEY is bound to the deployment.",
      },
      { status: 503 },
    );
  }

  const decision = await authorizeAdminRequest(request, env);
  if (!decision.allowed) return decision.response as Response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error:
          "Invalid provisioning payload. label/expires_at/quota_total/adoptLegacyData only.",
      },
      { status: 400 },
    );
  }

  const expiresAt = parseExpiry(parsed.data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds()) {
    return Response.json(
      {
        success: false,
        error: "expires_at must be a valid future date.",
      },
      { status: 400 },
    );
  }

  const rawKey = randomKey();
  const keyHash = await hashAccessKey(rawKey);
  const id = crypto.randomUUID();
  const now = nowSeconds();

  try {
    await env.DB.prepare(
      `INSERT INTO activation_keys
         (id, key_hash, label, status, created_at, expires_at,
          brand_locked, quota_total, quota_used)
       VALUES (?, ?, ?, 'active', ?, ?, 0, ?, 0)`,
    )
      .bind(
        id,
        keyHash,
        parsed.data.label ?? null,
        now,
        expiresAt,
        parsed.data.quota_total ?? 0,
      )
      .run();

    if (parsed.data.adoptLegacyData) {
      const tables = [
        "products",
        "product_assets",
        "campaigns",
        "creatives",
        "product_promotions",
        "business_settings",
      ];
      await env.DB.batch(
        tables.map((table) =>
          env.DB.prepare(
            `UPDATE ${table} SET tenant_key_id = ? WHERE tenant_key_id IS NULL`,
          ).bind(id),
        ),
      );
    }
  } catch (error) {
    console.error("Failed to provision an activation key.", error);
    return Response.json(
      {
        success: false,
        error:
          "Unable to provision the key. Ensure migrations 0003 and 0004 are applied.",
      },
      { status: 500 },
    );
  }

  const row: ActivationKeyRow = {
    id,
    label: parsed.data.label ?? null,
    status: "active",
    created_at: now,
    expires_at: expiresAt,
    brand_locked: 0,
    locked_brand_name: null,
    locked_industry: null,
    locked_logo_url: null,
    locked_brand_json: null,
    locked_at: null,
    quota_total: parsed.data.quota_total ?? 0,
    quota_used: 0,
  };

  return Response.json(
    {
      success: true,
      // Returned exactly once; store it securely.
      access_key: rawKey,
      expires_at: expiresAt,
      tenant: tenantMePayload(tenantFromRow(row)),
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
