import {
  AUTH_MODE_HEADER,
  authorizeAdminRequest,
  type AuthEnv,
} from "./_auth";

interface Env extends AuthEnv {
  DB: D1Database;
}

/**
 * Applies to every route under `/api`.
 *
 * Reads pass through untouched. Writes under `/api/db/*` and `/api/assets/*`
 * require the admin key whenever `ADMIN_API_KEY` is bound; in preview mode the
 * response is tagged so the dashboard can warn that writes are still open.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const decision = await authorizeAdminRequest(context.request, context.env);

  if (!decision.allowed) {
    return decision.response as Response;
  }

  const response = await context.next();

  if (
    decision.mode === "unconfigured-preview" &&
    (new URL(context.request.url).pathname.startsWith("/api/db/") ||
      new URL(context.request.url).pathname.startsWith("/api/assets/") ||
      new URL(context.request.url).pathname === "/api/ai/harvest-random") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(
      context.request.method.toUpperCase(),
    )
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
