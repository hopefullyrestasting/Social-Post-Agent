import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { requireAdmin } from "../functions/api/admin/_admin";

async function run() {
  const env = { ADMIN_API_KEY: "owner-test-key" };
  assert.equal(
    (await requireAdmin(new Request("https://example.test/api/admin/health"), env))?.status,
    401,
  );
  assert.equal(
    (
      await requireAdmin(
        new Request("https://example.test/api/admin/health", {
          headers: { "X-Admin-Key": "arh_tenant" },
        }),
        env,
      )
    )?.status,
    401,
  );
  assert.equal(
    await requireAdmin(
      new Request("https://example.test/api/admin/health", {
        headers: { Authorization: "Bearer owner-test-key" },
      }),
      env,
    ),
    null,
  );

  const migration = readFileSync("migrations/0007_admin_and_scale_indexes.sql", "utf8");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_products_tenant_queue/);
  const support = readFileSync("functions/api/admin/support.ts", "utf8");
  assert.match(support, /tenant_key_id/);
  assert.match(support, /reset_queue/);
  assert.match(support, /reset_brand_lock/);
  assert.match(support, /locked_brand_name = NULL/);
  const adminPage = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(adminPage, /Reset Brand Lock/);
  assert.match(adminPage, /activation key remains valid/);
  console.log("admin authorization and scale contract checks passed");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
