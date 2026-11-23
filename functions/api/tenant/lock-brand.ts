import { z } from "zod";
import {
  authenticateTenant,
  loadActivationKeyById,
  tenantFromRow,
  tenantMePayload,
  tenantSettingKey,
  type TenantBrandLock,
  type TenantEnv,
} from "../_tenant";

/**
 * POST /api/tenant/lock-brand
 *
 * First call on an unlocked key persists the company identity and locks it
 * permanently. Later calls:
 *   - same brand_name + industry -> 200 (idempotent, logo may be updated)
 *   - different brand_name/industry -> 403 (one-time lock violation)
 */

const MAX_LOGO_LENGTH = 500 * 1024;
const BRAND_LOCK_VERSION = 1;

const logoValue = z
  .union([z.string().trim().max(MAX_LOGO_LENGTH), z.null()])
  .optional();

const contactValue = z
  .union([
    z.string().trim().max(500),
    z.record(z.string(), z.unknown()),
    z.null(),
  ])
  .optional();

const lockSchema = z
  .object({
    brand_name: z.string().trim().min(2).max(120),
    industry: z.string().trim().min(2).max(120),
    logo_url: logoValue,
    description: z.string().trim().max(2000).optional(),
    contact_info: contactValue,
    currency: z.string().trim().max(8).optional(),
    locale: z.string().trim().max(16).optional(),
    rtl: z.boolean().optional(),
  })
  .strict();

function normalizeIdentity(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isAllowedLogo(value: string): boolean {
  if (!value) return true;
  if (/^https?:\/\//i.test(value)) return value.length <= 2048;
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(value)) {
    return value.length <= MAX_LOGO_LENGTH;
  }
  return false;
}

function contactFields(contactInfo: unknown): {
  phone: string | null;
  whatsapp: string | null;
} {
  if (typeof contactInfo === "string") {
    return { phone: contactInfo.trim() || null, whatsapp: null };
  }
  if (contactInfo && typeof contactInfo === "object") {
    const record = contactInfo as Record<string, unknown>;
    const phone = typeof record.phone === "string" ? record.phone.trim() : "";
    const whatsapp =
      typeof record.whatsapp === "string" ? record.whatsapp.trim() : "";
    return { phone: phone || null, whatsapp: whatsapp || null };
  }
  return { phone: null, whatsapp: null };
}

function settingStatement(
  env: TenantEnv,
  tenantId: string,
  key: string,
  value: string | null,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO business_settings (key, value, updated_at, tenant_key_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at,
       tenant_key_id = excluded.tenant_key_id`,
  ).bind(tenantSettingKey(tenantId, key), value, now, tenantId);
}

export const onRequestPost: PagesFunction<TenantEnv> = async ({
  request,
  env,
}) => {
  const auth = await authenticateTenant(request, env);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = lockSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        code: "invalid_brand_payload",
        error:
          "brand_name and industry are required (2–120 chars). logo_url must be https or an image data URI.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const brandName = data.brand_name.replace(/\s+/g, " ").trim();
  const industry = data.industry.replace(/\s+/g, " ").trim();
  const submittedLogo = data.logo_url ?? null;

  if (submittedLogo && !isAllowedLogo(submittedLogo)) {
    return Response.json(
      {
        success: false,
        code: "invalid_logo",
        error:
          "logo_url must be an https URL or a PNG/JPEG/WebP data URI up to 500KB.",
      },
      { status: 400 },
    );
  }

  if (tenant.brandLocked && tenant.brand) {
    const sameName =
      normalizeIdentity(tenant.brand.brandName) === normalizeIdentity(brandName);
    const sameIndustry =
      normalizeIdentity(tenant.brand.industry) === normalizeIdentity(industry);

    if (!sameName || !sameIndustry) {
      return Response.json(
        {
          success: false,
          code: "brand_locked",
          error:
            "This key is permanently locked to its company and industry and cannot switch brands.",
          locked: {
            brand_name: tenant.brand.brandName,
            industry: tenant.brand.industry,
          },
        },
        { status: 403 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const nextLogo = submittedLogo ?? tenant.brand.logoUrl ?? null;
    if (submittedLogo && submittedLogo !== tenant.brand.logoUrl) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE activation_keys SET locked_logo_url = ? WHERE id = ?",
        ).bind(submittedLogo, tenant.id),
        settingStatement(env, tenant.id, "brand_logo_url", submittedLogo, now),
      ]);
    }

    const row = await loadActivationKeyById(env, tenant.id);
    const updated = row ? tenantFromRow(row) : tenant;
    if (nextLogo && !updated.brand?.logoUrl) {
      updated.brand = { ...(updated.brand as TenantBrandLock), logoUrl: nextLogo };
    }

    return Response.json(
      {
        success: true,
        already_locked: true,
        tenant: tenantMePayload(updated),
      },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  }

  if (tenant.brandLocked && !tenant.brand) {
    return Response.json(
      {
        success: false,
        code: "brand_lock_corrupt",
        error:
          "This key is marked locked but its brand profile is incomplete. Contact the administrator.",
      },
      { status: 409 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const description = data.description ?? "";
  const currency = data.currency || "EGP";
  const locale = data.locale || "ar-EG";
  const rtl = data.rtl !== false;
  const contactInfo = data.contact_info ?? null;
  const contacts = contactFields(contactInfo);
  const brandJson = JSON.stringify({
    version: BRAND_LOCK_VERSION,
    brandName,
    industry,
    logoUrl: submittedLogo,
    description,
    contactInfo,
    currency,
    locale,
    rtl,
  });

  const owner = await env.DB.prepare(
    `UPDATE activation_keys
     SET brand_locked = 1,
         locked_brand_name = ?,
         locked_industry = ?,
         locked_logo_url = ?,
         locked_brand_json = ?,
         locked_at = ?
     WHERE id = ? AND brand_locked = 0`,
  )
    .bind(
      brandName,
      industry,
      submittedLogo,
      brandJson,
      now,
      tenant.id,
    )
    .run();

  const changes = (owner as { meta?: { changes?: number } } | undefined)?.meta
    ?.changes;
  if (changes === 0) {
    const row = await loadActivationKeyById(env, tenant.id);
    if (row?.brand_locked) {
      return Response.json(
        {
          success: false,
          code: "brand_locked",
          error:
            "This key was locked by another request. Refresh and review the locked brand.",
        },
        { status: 403 },
      );
    }
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO brand_profiles
         (id, name, industry, tagline, phone, whatsapp, logo_url, logo_tone,
          font_family, product_context_notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'light', 'Cairo', ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         industry = excluded.industry,
         tagline = excluded.tagline,
         phone = excluded.phone,
         whatsapp = excluded.whatsapp,
         logo_url = excluded.logo_url,
         product_context_notes = excluded.product_context_notes,
         is_active = 1,
         updated_at = excluded.updated_at`,
    ).bind(
      tenant.id,
      brandName,
      industry,
      description || null,
      contacts.phone,
      contacts.whatsapp,
      submittedLogo,
      description || null,
      now,
      now,
    ),
  ];

  const settings: [string, string | null][] = [
    ["brand_name", brandName],
    ["industry", industry],
    ["brand_logo_url", submittedLogo],
    ["brand_description", description || null],
    ["currency", currency],
    ["locale", locale],
    ["rtl", rtl ? "1" : "0"],
    [
      "contact_info",
      contactInfo === null
        ? null
        : typeof contactInfo === "string"
          ? contactInfo
          : JSON.stringify(contactInfo),
    ],
  ];

  for (const [key, value] of settings) {
    statements.push(settingStatement(env, tenant.id, key, value, now));
  }

  await env.DB.batch(statements);

  const row = await loadActivationKeyById(env, tenant.id);
  const updatedTenant = row
    ? tenantFromRow(row)
    : {
        ...tenant,
        brandLocked: true,
        brand: {
          brandName,
          industry,
          logoUrl: submittedLogo,
          description,
          contactInfo,
          currency,
          locale,
          rtl,
          lockedAt: now,
        },
      };

  return Response.json(
    {
      success: true,
      locked: true,
      tenant: tenantMePayload(updatedTenant),
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
