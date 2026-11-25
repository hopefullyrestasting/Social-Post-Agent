import {
  authenticateTenant,
  loadTenantProvisioning,
  tenantMePayload,
  type TenantEnv,
} from "../_tenant";

/**
 * GET /api/tenant/me
 *
 * Returns the annual subscription state, one-time brand lock state and the
 * operator-supplied provisioning defaults for the supplied access key. Never
 * returns the key hash, raw key or admin key.
 */
export const onRequestGet: PagesFunction<TenantEnv> = async ({
  request,
  env,
}) => {
  const auth = await authenticateTenant(request, env);
  if (!auth.ok) return auth.response;

  const provisioning = await loadTenantProvisioning(env, auth.tenant.id);
  return Response.json(
    {
      success: true,
      tenant: { ...tenantMePayload(auth.tenant), provisioning },
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
