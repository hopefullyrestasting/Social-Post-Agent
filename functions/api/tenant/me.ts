import {
  authenticateTenant,
  tenantMePayload,
  type TenantEnv,
} from "../_tenant";

/**
 * GET /api/tenant/me
 *
 * Returns the annual subscription state + one-time brand lock state for the
 * key supplied in the request. Never returns the key hash or the raw key.
 */
export const onRequestGet: PagesFunction<TenantEnv> = async ({
  request,
  env,
}) => {
  const auth = await authenticateTenant(request, env);
  if (!auth.ok) return auth.response;

  return Response.json(
    { success: true, tenant: tenantMePayload(auth.tenant) },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
