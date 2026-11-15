/**
 * Admin write protection for `/api/db/*`.
 *
 * Every state-mutating request must present `X-Admin-Key` matching
 * `context.env.ADMIN_API_KEY`. Keys are compared as SHA-256 digests in constant
 * time so a timing side-channel cannot leak the secret.
 *
 * When `ADMIN_API_KEY` is not bound yet (local development and the first
 * preview), writes are allowed and the response carries
 * `X-Auth-Mode: unconfigured-preview` so the mode is never silent.
 */

export const ADMIN_KEY_HEADER = "X-Admin-Key";
export const AUTH_MODE_HEADER = "X-Auth-Mode";
export const UNCONFIGURED_AUTH_MODE = "unconfigured-preview";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthEnv {
  ADMIN_API_KEY?: string;
}

export interface AuthDecision {
  allowed: boolean;
  /** True when this request is a write that requires an admin key. */
  required: boolean;
  mode: "configured" | "unconfigured-preview";
  response?: Response;
}

export function isProtectedRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith("/api/db/") &&
    MUTATING_METHODS.has(request.method.toUpperCase())
  );
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

export async function authorizeAdminRequest(
  request: Request,
  env: AuthEnv | undefined,
): Promise<AuthDecision> {
  const configuredKey = (env?.ADMIN_API_KEY ?? "").trim();
  const mode = configuredKey ? "configured" : UNCONFIGURED_AUTH_MODE;

  if (!isProtectedRequest(request)) {
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
      return { allowed: true, required: true, mode: "configured" };
    }
  }

  return {
    allowed: false,
    required: true,
    mode: "configured",
    response: Response.json(
      {
        success: false,
        error: "Unauthorized: a valid admin key is required for writes.",
      },
      {
        status: 401,
        headers: {
          [AUTH_MODE_HEADER]: "configured",
          "WWW-Authenticate": `${ADMIN_KEY_HEADER} realm="al-rahma-dashboard"`,
        },
      },
    ),
  };
}
