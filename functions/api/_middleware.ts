import {
  AUTH_MODE_HEADER,
  authorizeAdminRequest,
  isTenantWriteRequest,
  type AuthEnv,
} from "./_auth";
import {
  accessKeyRequiredResponse,
  extractAccessKey,
  resolveTenantScope,
} from "./_tenant";

interface Env extends AuthEnv {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Applies to every route under `/api`.
 *
 * Admin/provisioning routes require `ADMIN_API_KEY`. Normal tenant studio
 * writes (`/api/db/*`, `/api/assets/*`, `/api/ai/*`) accept either a valid
 * admin key or a valid, non-expired annual access key. With an access key the
 * request is scoped to that tenant, so one customer can never touch another's
 * rows. Reads pass through; handlers resolve their own tenant scope.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const decision = await authorizeAdminRequest(context.request, context.env);

  if (!decision.allowed) {
    return decision.response as Response;
  }

  const url = new URL(context.request.url);
  const mutating = MUTATING_METHODS.has(context.request.method.toUpperCase());
  const tenantScopedWrite = isTenantWriteRequest(context.request);
  const hasAccessKey = Boolean(extractAccessKey(context.request).trim());

  if (tenantScopedWrite && context.env.DB) {
    if (decision.requiresTenantKey && !hasAccessKey) {
      // An admin key is bound, but this is a tenant studio write. Report the
      // actual problem instead of falsely asking for an admin key.
      const response = accessKeyRequiredResponse();
      response.headers.set(AUTH_MODE_HEADER, decision.mode);
      return response;
    }

    // A matching admin key may run unscoped. Any supplied access key is still
    // validated so an invalid/expired key never silently falls back to admin.
    if (!decision.viaAdmin || hasAccessKey) {
      const scope = await resolveTenantScope(context.request, context.env);
      if (!scope.ok) return scope.response;
    }
  }

  // When no admin key is configured, tenant writes may still be blocked by
  // resolveTenantScope once keys exist; tag the legacy anonymous mode.
  if (
    decision.mode === "unconfigured-preview" &&
    (url.pathname.startsWith("/api/db/") ||
      url.pathname.startsWith("/api/assets/") ||
      url.pathname === "/api/ai/harvest-random") &&
    mutating
  ) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set(AUTH_MODE_HEADER, "unconfigured-preview");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return context.next();
};
