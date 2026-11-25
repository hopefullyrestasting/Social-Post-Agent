import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { requireAdmin } from "../functions/api/admin/_admin";

const env = { ADMIN_API_KEY: "owner-test-key" };
assert.equal((await requireAdmin(new Request("https://example.test/api/admin/health"), env))?.status, 401);
assert.equal((await requireAdmin(new Request("https://example.test/api/admin/health", {headers:{"X-Admin-Key":"arh_tenant"}}), env))?.status, 401);
assert.equal(await requireAdmin(new Request("https://example.test/api/admin/health", {headers:{"Authorization":"Bearer owner-test-key"}}), env), null);
const migration = readFileSync("migrations/0007_admin_and_scale_indexes.sql", "utf8");
assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_products_tenant_queue/);
const support = readFileSync("functions/api/admin/support.ts", "utf8");
assert.match(support, /tenant_key_id/);
assert.match(support, /reset_queue/);
console.log("admin authorization and scale contract checks passed");
