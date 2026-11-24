/**
 * Request authorization for `/api/*`.
 *
 * There are two credentials with different powers:
 *   - `ADMIN_API_KEY`: admin/provisioning actions (for example tenant creation
 *     and research harvesting).
 *   - annual tenant `accessKey` (`arh_...`): normal tenant studio writes, scoped
 *     by `resolveTenantScope` in the middleware and in each handler.
 *
 * Tenant writes may be authorized by either credential. Admin-only actions
 * always require the admin key. Keys are compared as SHA-256 digests in
 * constant time so a timing side-channel cannot leak a secret.
 *
 * When `ADMIN_API_KEY` is not bound yet (local development and the first
 * preview), writes are allowed and the response carries
 * `X-Auth-Mode: unconfigured-preview` so the mode is never silent.
 */

export const ADMIN_KEY_HEADER = "X-Admin-Key";
export const AUTH_MODE_HEADER = "X-Auth-Mode";
export const UNCONFIGURED_AUTH_MODE = "unconfigured-preview";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Provisioning/internal routes that a tenant access key can never authorize. */
const ADMIN_ONLY_PATHS = new Set([
  "/api/tenant/provision",
  "/api/ai/harvest-random",
]);

export interface AuthEnv {
  ADMIN_API_KEY?: string;
}

export interface AuthDecision {
  allowed: boolean;
  /** True when the request requires a credential (admin key or access key). */
  required: boolean;
  mode: "configured" | "unconfigured-preview";
  /** The request carried a matching admin key, so it may run unscoped. */
  viaAdmin?: boolean;
  /** Admin is configured and no admin key matched: middleware must verify the tenant key. */
  requiresTenantKey?: boolean;
  response?: Response;
}

function isMutating(request: Request): boolean {
  return MUTATING_METHODS.has(request.method.toUpperCase());
}

/** Admin-only provisioning/internal writes. */
export function isAdminOnlyRequest(request: Request): boolean {
  if (!isMutating(request)) return false;
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  return ADMIN_ONLY_PATHS.has(path);
}

/** Tenant-scoped studio writes. A valid annual access key is sufficient here. */
export function isTenantWriteRequest(request: Request): boolean {
  if (!isMutating(request) || isAdminOnlyRequest(request)) return false;
  const path = new URL(request.url).pathname;
  return (
    path.startsWith("/api/db/") ||
    path.startsWith("/api/assets/") ||
    path.startsWith("/api/ai/")
  );
}

/**
 * Legacy admin-auth surface: admin-only writes plus D1/asset writes. AI scene
 * generation is not admin-protected here; the middleware still resolves its
 * tenant scope when an access key territory is active.
 */
export function isProtectedRequest(request: Request): boolean {
  if (!isMutating(request)) return false;
  if (isAdminOnlyRequest(request)) return true;
  const path = new URL(request.url).pathname;
  return path.startsWith("/api/db/") || path.startsWith("/api/assets/");
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hashed);
}

/** Constant-time comparison of two equal-length SHA-256 digests. */
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function adminRequiredResponse(): Response {
  return Response.json(
    {
      success: false,
      code: "admin_key_required",
      error: "Unauthorized: a valid admin key is required for admin provisioning actions.",
    },
    {
      status: 401,
      headers: {
        [AUTH_MODE_HEADER]: "configured",
        "WWW-Authenticate": `${ADMIN_KEY_HEADER} realm="al-rahma-dashboard"`,
      },
    },
  );
}

export async function authorizeAdminRequest(
  request: Request,
  env: AuthEnv | undefined,
): Promise<AuthDecision> {
  const configuredKey = (env?.ADMIN_API_KEY ?? "").trim();
  const mode = configuredKey ? "configured" : UNCONFIGURED_AUTH_MODE;

  // AI generation writes are tenant-scoped by the middleware but were never
  // admin-key protected; keep that contract while still accepting tenant keys.
  if (!isAdminOnlyRequest(request) && !isProtectedRequest(request)) {
    return { allowed: true, required: false, mode };
  }

  if (!configuredKey) {
    return { allowed: true, required: false, mode: UNCONFIGURED_AUTH_MODE };
  }

  const providedKey = (request.headers.get(ADMIN_KEY_HEADER) ?? "").trim();
  if (providedKey) {
    const [providedDigest, configuredDigest] = await Promise.all([
      digest(providedKey),
      digest(configuredKey),
    ]);
    if (constantTimeEqual(providedDigest, configuredDigest)) {
      return { allowed: true, required: true, mode: "configured", viaAdmin: true };
    }
  }

  if (isAdminOnlyRequest(request)) {
    return {
      allowed: false,
      required: true,
      mode: "configured",
      response: adminRequiredResponse(),
    };
  }

  // Tenant writes are verified by the middleware via resolveTenantScope. Any
  // access-key problem is reported there with the precise reason (missing,
  // invalid, revoked or expired), never as a missing admin key.
  return {
    allowed: true,
    required: true,
    mode: "configured",
    requiresTenantKey: true,
  };
}
