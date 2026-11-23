/**
 * Per-activation-key tenant authentication (Phase 2).
 *
 * One activation key == one tenant workspace. Only the SHA-256 digest of the
 * raw key is stored in D1 (`activation_keys.key_hash`).
 *
 * Annual plan rules:
 *   - `status` must be `active`
 *   - `expires_at` (epoch seconds) must be in the future when set
 *   - there is NO hard image quota: generation is unlimited for the year
 *   - rate/concurrency is protected with a short D1-backed lease
 */

export interface TenantEnv {
  DB: D1Database;
}

export interface TenantScopeEnv extends TenantEnv {
  /**
   * Optional hard switch. When set to `1`/`true`/`yes`/`on`, every request must
   * present a valid access key even before the first key has been provisioned.
   *
   * When unset, the deployment stays backward compatible: if the
   * `activation_keys` table has no rows yet, requests run in single-tenant
   * legacy mode (unscoped). As soon as one key exists, every request must be
   * authenticated and is scoped to that key's data.
   */
  REQUIRE_ACCESS_KEY?: string;
}

export interface ActivationKeyRow {
  id: string;
  label: string | null;
  status: string;
  created_at: number | null;
  expires_at: number | null;
  brand_locked: number;
  locked_brand_name: string | null;
  locked_industry: string | null;
  locked_logo_url: string | null;
  locked_brand_json: string | null;
  locked_at: number | null;
  quota_total: number | null;
  quota_used: number | null;
}

export interface TenantBrandLock {
  brandName: string;
  industry: string;
  logoUrl: string | null;
  description: string;
  contactInfo: unknown;
  currency: string;
  locale: string;
  rtl: boolean;
  lockedAt: number | null;
}

export interface TenantContext {
  id: string;
  label: string | null;
  status: string;
  createdAt: number | null;
  expiresAt: number | null;
  brandLocked: boolean;
  brand: TenantBrandLock | null;
  quota: { total: number; used: number; enforced: false };
}

export interface TenantAuthSuccess {
  ok: true;
  tenant: TenantContext;
}

export interface TenantAuthFailure {
  ok: false;
  response: Response;
}

export type TenantAuthResult = TenantAuthSuccess | TenantAuthFailure;

export const ACCESS_KEY_HEADER = "X-Access-Key";
export const ACTIVATION_KEY_HEADER = "X-Activation-Key";
export const ACCESS_KEY_COOKIE = "al_rahma_access_key";

const BRAND_LOCK_VERSION = 1;
const ANNUAL_SECONDS = 365 * 24 * 60 * 60;
const DEFAULT_LEASE_SECONDS = 180;
const DEFAULT_COOLDOWN_SECONDS = 3;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function annualExpiryFrom(issuedAtSeconds = nowSeconds()): number {
  return issuedAtSeconds + ANNUAL_SECONDS;
}

/** SHA-256 hex digest of the raw access key. Raw keys are never stored. */
export async function hashAccessKey(rawKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawKey.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/**
 * Reads the raw access key from (in priority order):
 *   1. `X-Access-Key`
 *   2. `X-Activation-Key`
 *   3. `Authorization: Bearer <key>`
 *   4. the dashboard cookie (needed for <img>/canvas asset loads)
 */
export function extractAccessKey(request: Request): string {
  const direct =
    request.headers.get(ACCESS_KEY_HEADER) ??
    request.headers.get(ACTIVATION_KEY_HEADER) ??
    "";
  if (direct.trim()) return direct.trim();

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (bearer?.[1]) return bearer[1].trim();

  return cookieValue(request, ACCESS_KEY_COOKIE).trim();
}

export function isoFromSeconds(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function brandLockFromRow(row: ActivationKeyRow): TenantBrandLock | null {
  if (!row.brand_locked) return null;

  const extra = parseJson(row.locked_brand_json);
  const brandName =
    (row.locked_brand_name ?? "").trim() ||
    (typeof extra.brandName === "string" ? extra.brandName : "");
  const industry =
    (row.locked_industry ?? "").trim() ||
    (typeof extra.industry === "string" ? extra.industry : "");
  if (!brandName) return null;

  return {
    brandName,
    industry,
    logoUrl:
      (row.locked_logo_url ?? "").trim() ||
      (typeof extra.logoUrl === "string" ? extra.logoUrl : null),
    description:
      typeof extra.description === "string" ? extra.description : "",
    contactInfo: extra.contactInfo ?? null,
    currency:
      typeof extra.currency === "string" && extra.currency.trim()
        ? extra.currency.trim()
        : "EGP",
    locale:
      typeof extra.locale === "string" && extra.locale.trim()
        ? extra.locale.trim()
        : "ar-EG",
    rtl: extra.rtl === false ? false : true,
    lockedAt: row.locked_at ?? null,
  };
}

export function tenantFromRow(row: ActivationKeyRow): TenantContext {
  const quotaTotal = Number(row.quota_total ?? 0);
  const quotaUsed = Number(row.quota_used ?? 0);
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
    brandLocked: Boolean(row.brand_locked),
    brand: brandLockFromRow(row),
    quota: {
      total: Number.isFinite(quotaTotal) ? quotaTotal : 0,
      used: Number.isFinite(quotaUsed) ? quotaUsed : 0,
      enforced: false,
    },
  };
}

function failure(
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
): TenantAuthFailure {
  return {
    ok: false,
    response: Response.json(
      { success: false, code, error, ...extra },
      {
        status,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          ...(status === 401
            ? { "WWW-Authenticate": `${ACCESS_KEY_HEADER} realm="social-post-agent"` }
            : {}),
        },
      },
    ),
  };
}

export async function loadActivationKey(
  env: TenantEnv,
  rawKey: string,
): Promise<ActivationKeyRow | null> {
  const hash = await hashAccessKey(rawKey);
  return env.DB.prepare(
    `SELECT id, label, status, created_at, expires_at, brand_locked,
            locked_brand_name, locked_industry, locked_logo_url,
            locked_brand_json, locked_at, quota_total, quota_used
     FROM activation_keys
     WHERE key_hash = ?
     LIMIT 1`,
  )
    .bind(hash)
    .first<ActivationKeyRow>();
}

export async function loadActivationKeyById(
  env: TenantEnv,
  id: string,
): Promise<ActivationKeyRow | null> {
  return env.DB.prepare(
    `SELECT id, label, status, created_at, expires_at, brand_locked,
            locked_brand_name, locked_industry, locked_logo_url,
            locked_brand_json, locked_at, quota_total, quota_used
     FROM activation_keys
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(id)
    .first<ActivationKeyRow>();
}

export async function authenticateTenant(
  request: Request,
  env: TenantEnv,
): Promise<TenantAuthResult> {
  const rawKey = extractAccessKey(request);
  if (!rawKey) {
    return failure(
      401,
      "access_key_required",
      "An access key is required. Send X-Access-Key or Authorization: Bearer <key>.",
    );
  }

  let row: ActivationKeyRow | null = null;
  try {
    row = await loadActivationKey(env, rawKey);
  } catch (error) {
    console.error("Activation key lookup failed.", error);
    return failure(500, "access_key_lookup_failed", "Unable to validate the access key.");
  }

  if (!row) {
    return failure(401, "access_key_invalid", "The access key is not valid.");
  }

  if (row.status !== "active") {
    return failure(
      403,
      row.status === "revoked" ? "access_key_revoked" : "access_key_inactive",
      row.status === "revoked"
        ? "This access key has been revoked."
        : `This access key is not active (status: ${row.status}).`,
    );
  }

  const now = nowSeconds();
  if (typeof row.expires_at === "number" && row.expires_at <= now) {
    return failure(
      403,
      "access_key_expired",
      "This annual access key has expired. Renew the key to continue generating.",
      { expires_at: row.expires_at, expires_at_iso: isoFromSeconds(row.expires_at) },
    );
  }

  return { ok: true, tenant: tenantFromRow(row) };
}

/** Tenant auth + a completed one-time brand lock (generation/branding paths). */
export async function authenticateLockedTenant(
  request: Request,
  env: TenantEnv,
): Promise<TenantAuthResult> {
  const result = await authenticateTenant(request, env);
  if (!result.ok) return result;
  if (!result.tenant.brandLocked || !result.tenant.brand) {
    return failure(
      403,
      "brand_lock_required",
      "Complete the one-time brand setup before generating creatives.",
    );
  }
  return result;
}

export function tenantMePayload(tenant: TenantContext): Record<string, unknown> {
  const now = nowSeconds();
  const expiresIso = isoFromSeconds(tenant.expiresAt);
  const daysRemaining =
    typeof tenant.expiresAt === "number"
      ? Math.max(0, Math.ceil((tenant.expiresAt - now) / 86_400))
      : null;

  return {
    id: tenant.id,
    label: tenant.label,
    status: tenant.status,
    expires_at: tenant.expiresAt,
    expires_at_iso: expiresIso,
    days_remaining: daysRemaining,
    brand_locked: tenant.brandLocked,
    brand: tenant.brand,
    quota: tenant.quota,
    subscription: {
      plan: "annual",
      status: tenant.status,
      expires_at: tenant.expiresAt,
      expires_at_iso: expiresIso,
      days_remaining: daysRemaining,
      unlimited_generation: true,
    },
  };
}

/**
 * Atomically lease one generation slot for a key.
 *
 * Uses a conditional UPDATE so two Worker isolates cannot both hold the lease.
 * `RETURNING` is avoided for maximum D1 compatibility; the change count is
 * read from `meta.changes`.
 */
export async function leaseGenerationSlot(
  env: TenantEnv,
  tenantId: string,
  options: { cooldownSeconds?: number; leaseSeconds?: number } = {},
): Promise<{ acquired: boolean; leaseUntil: number; retryAfterSeconds: number }> {
  const cooldownSeconds = Math.max(
    0,
    options.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS,
  );
  const leaseSeconds = Math.max(30, options.leaseSeconds ?? DEFAULT_LEASE_SECONDS);
  const now = nowSeconds();
  const leaseUntil = now + leaseSeconds;
  const cooldownThreshold = now - cooldownSeconds;

  const result = await env.DB.prepare(
    `UPDATE activation_keys
     SET in_flight_until = ?, last_generation_at = ?
     WHERE id = ?
       AND status = 'active'
       AND (in_flight_until IS NULL OR in_flight_until <= ?)
       AND (last_generation_at IS NULL OR last_generation_at <= ?)`,
  )
    .bind(leaseUntil, now, tenantId, now, cooldownThreshold)
    .run();

  const changes = (result as { meta?: { changes?: number } } | undefined)?.meta
    ?.changes;
  const acquired = changes === undefined ? true : changes > 0;

  return {
    acquired,
    leaseUntil,
    retryAfterSeconds: acquired ? 0 : Math.max(1, cooldownSeconds),
  };
}

export async function releaseGenerationSlot(
  env: TenantEnv,
  tenantId: string,
  leaseUntil: number,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE activation_keys
       SET in_flight_until = NULL
       WHERE id = ? AND in_flight_until = ?`,
    )
      .bind(tenantId, leaseUntil)
      .run();
  } catch (error) {
    console.error("Failed to release the generation lease.", error);
  }
}

/** Informational telemetry only — never enforces a quota cap. */
export async function recordGeneration(
  env: TenantEnv,
  tenantId: string,
  input: { action: string; campaignId?: string | null; notes?: string | null },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO quota_ledger
         (id, key_id, action, delta, campaign_id, notes, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        tenantId,
        input.action.slice(0, 80),
        input.campaignId ?? null,
        input.notes ?? null,
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    console.error("Failed to append the quota ledger entry.", error);
  }
}

/** Namespaced key/value helper that avoids business_settings PK collisions. */
export function tenantSettingKey(tenantId: string, key: string): string {
  return `${tenantId}:${key}`;
}

/** Splits a tenant-namespaced settings key back into `[tenantId, key]`. */
export function parseTenantSettingKey(
  value: string,
): { tenantId: string; key: string } | null {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    tenantId: value.slice(0, separator),
    key: value.slice(separator + 1),
  };
}

export interface TenantScope {
  /** Non-null when the request is scoped to one activation key. */
  tenantId: string | null;
  tenant: TenantContext | null;
  /** True when tenant scoping is active (a key was supplied or provisioned). */
  enforced: boolean;
}

export type TenantScopeResult = ({ ok: true } & TenantScope) | TenantAuthFailure;

/**
 * Forces access-key authentication for every request, even before the first
 * key exists. Use for deployments that must never serve data anonymously.
 */
export function requiresAccessKey(env: TenantScopeEnv | undefined): boolean {
  const flag = (env?.REQUIRE_ACCESS_KEY ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * Counts provisioned keys. A missing `activation_keys` table (migration 0003
 * not applied yet) means single-tenant legacy mode, never a hard failure.
 */
export async function countActivationKeys(env: TenantEnv): Promise<number> {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activation_keys",
    ).first<{ count: number }>();
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolves the tenant scope for reads and writes.
 *
 * - Valid key present  -> scoped to that key.
 * - Invalid/expired key -> 401/403, never a silent downgrade to global data.
 * - No key, no keys provisioned (and no `REQUIRE_ACCESS_KEY`) -> legacy mode.
 * - No key, keys provisioned   -> 401.
 */
export async function resolveTenantScope(
  request: Request,
  env: TenantScopeEnv,
): Promise<TenantScopeResult> {
  if (extractAccessKey(request)) {
    const auth = await authenticateTenant(request, env);
    if (!auth.ok) return auth;
    return {
      ok: true,
      tenantId: auth.tenant.id,
      tenant: auth.tenant,
      enforced: true,
    };
  }

  if (requiresAccessKey(env)) {
    return failure(
      401,
      "access_key_required",
      "An access key is required. Send X-Access-Key or Authorization: Bearer <key>.",
    );
  }

  const provisioned = await countActivationKeys(env);
  if (provisioned > 0) {
    return failure(
      401,
      "access_key_required",
      "An access key is required. Send X-Access-Key or Authorization: Bearer <key>.",
    );
  }

  return { ok: true, tenantId: null, tenant: null, enforced: false };
}

/**
 * Confirms a product belongs to the resolved tenant. Legacy mode (null tenant)
 * keeps working unchanged.
 */
export async function tenantOwnsProduct(
  env: TenantEnv,
  tenantId: string | null,
  productId: string,
): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const row = await env.DB.prepare(
      "SELECT id FROM products WHERE id = ? AND tenant_key_id = ? LIMIT 1",
    )
      .bind(productId, tenantId)
      .first<{ id: string }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

export { BRAND_LOCK_VERSION };
