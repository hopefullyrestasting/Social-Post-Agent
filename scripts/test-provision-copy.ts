/**
 * Provisioning + logo-upload helper contract tests.
 *
 * No network or D1 is used: the admin endpoint is mocked so the tests verify
 * request shape, batching, secret handling and the asset URL contract used by
 * the one-time brand lock.
 */

import assert from "node:assert/strict";
import {
  buildProvisionPayload,
  buildProvisionPlans,
  isCopyKind,
  provisionCopies,
  redactAccessKey,
} from "../src/lib/al-rahma/provisioning";
import {
  isSupportedLogoMime,
  logoAcceptAttribute,
  usableAssetUrl,
} from "../src/lib/al-rahma/logo-upload";

type FetchCall = { url: string; init: RequestInit };

async function run() {
  assert.equal(isCopyKind("customer"), true);
  assert.equal(isCopyKind("marketing"), true);
  assert.equal(isCopyKind("demo"), true);
  assert.equal(isCopyKind("admin"), false);

  const redacted = redactAccessKey("arh_1234567890abcdef1234567890abcdef");
  assert.match(redacted, /^arh_1234••••cdef$/);
  assert.equal(redacted.includes("abcdef123456"), false);

  assert.equal(
    logoAcceptAttribute(),
    "image/png,image/jpeg,image/webp,image/svg+xml",
  );
  assert.equal(isSupportedLogoMime("image/svg+xml"), true);
  assert.equal(isSupportedLogoMime("image/avif"), false);

  assert.equal(
    usableAssetUrl({ asset: { usable_url: "https://x/logo.png", url: null } }),
    "https://x/logo.png",
  );
  assert.equal(
    usableAssetUrl({ asset: { url: "data:image/png;base64,AA" } }),
    "data:image/png;base64,AA",
  );
  assert.equal(usableAssetUrl({ asset: { url: null } }), null);

  const plans = buildProvisionPlans({
    count: 3,
    labelPrefix: "Demo",
    copyKind: "demo",
    notes: "Preview",
    expiresInDays: 30,
    brandDefaults: {
      brand_name: "Demo Store",
      locale: "en",
      support_contact: "support@example.test",
    },
    copies: [
      {
        label: "Reseller One",
        notes: "Partner",
        copyKind: "customer",
        brandDefaults: { industry: "Retail", rtl: false },
      },
    ],
  });
  assert.equal(plans.length, 3);
  assert.equal(plans[0]!.label, "Reseller One");
  assert.equal(plans[0]!.copyKind, "customer");
  assert.deepEqual(plans[0]!.brandDefaults, {
    brand_name: "Demo Store",
    locale: "en",
    support_contact: "support@example.test",
    industry: "Retail",
    rtl: false,
  });
  assert.equal(plans[1]!.label, "Demo 02");
  assert.equal(plans[2]!.label, "Demo 03");
  assert.match(plans[1]!.notes ?? "", /instance 2\/3/);

  const payload = buildProvisionPayload(plans[0]!);
  assert.equal(payload.label, "Reseller One");
  assert.equal(payload.copy_kind, "customer");
  assert.equal(payload.expires_in_days, 30);
  assert.deepEqual(payload.brand_defaults, plans[0]!.brandDefaults);
  assert.equal(JSON.stringify(payload).includes("ADMIN_API_KEY"), false);

  const calls: FetchCall[] = [];
  const fetchMock = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    const index = calls.length;
    return Response.json({
      success: true,
      access_key: `arh_${String(index).padStart(32, "0")}`,
      expires_at: 1_800_000_000 + index,
      tenant: { id: `tenant-${index}` },
    });
  }) as unknown as typeof fetch;

  const results = await provisionCopies(
    {
      apiUrl: "https://studio.example.test/api/tenant/provision",
      adminKey: "admin-secret-value",
      plans,
    },
    { fetch: fetchMock },
  );
  assert.equal(results.length, 3);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]!.url, "https://studio.example.test/api/tenant/provision");
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)["X-Admin-Key"],
    "admin-secret-value",
  );
  assert.equal(
    JSON.stringify(calls[0]!.init.body).includes("admin-secret-value"),
    false,
  );
  assert.equal(results[0]!.accessKey, `arh_${"0".repeat(31)}1`);
  assert.equal(results[2]!.tenantId, "tenant-3");

  const failingFetch = (async () =>
    Response.json(
      { success: false, error: "Provisioning is disabled." },
      { status: 503 },
    )) as unknown as typeof fetch;
  await assert.rejects(
    provisionCopies(
      {
        apiUrl: "https://studio.example.test/api/tenant/provision",
        adminKey: "admin-secret-value",
        plans: [plans[0]!],
      },
      { fetch: failingFetch },
    ),
    /503.*Provisioning is disabled/,
  );

  console.log("Provision-copy tests passed: batch plans, payloads, mocked admin calls, redaction and logo URL contract.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
