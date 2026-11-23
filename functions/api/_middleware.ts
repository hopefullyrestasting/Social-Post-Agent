import {
  AUTH_MODE_HEADER,
  authorizeAdminRequest,
  type AuthEnv,
} from "./_auth";
import { resolveTenantScope } from "./_tenant";

interface Env extends AuthEnv {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Applies to every route under `/api`.
 *
 * Writes and generation endpoints require:
 *   1. a valid admin key when `ADMIN_API_KEY` is bound, and
 *   2. a valid annual access key once tenant keys are provisioned
 *      (`/api/tenant/*` is exempt: provisioning is admin-only and brand
 *      locking authenticates the tenant inside its own handler).
 *
 * Reads pass through this layer; each read handler resolves the tenant scope so
 * one key can never read another tenant's rows.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const decision = await authorizeAdminRequest(context.request, context.env);

  if (!decision.allowed) {
    return decision.response as Response;
  }

  const url = new URL(context.request.url);
  const mutating = MUTATING_METHODS.has(context.request.method.toUpperCase());
  const tenantScopedWrite =
    mutating &&
    (url.pathname.startsWith("/api/db/") ||
      url.pathname.startsWith("/api/assets/") ||
      url.pathname.startsWith("/api/ai/"));

  if (tenantScopedWrite && context.env.DB) {
    const scope = await resolveTenantScope(context.request, context.env);
    if (!scope.ok) return scope.response;
  }

  const response = await context.next();

  if (
    decision.mode === "unconfigured-preview" &&
    (url.pathname.startsWith("/api/db/") ||
      url.pathname.startsWith("/api/assets/") ||
      url.pathname === "/api/ai/harvest-random") &&
    mutating
  ) {
    const headers = new Headers(response.headers);
    headers.set(AUTH_MODE_HEADER, "unconfigured-preview");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
};
