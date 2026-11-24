import assert from "node:assert/strict";
import { onRequest as apiMiddleware } from "../functions/api/_middleware";
import { onRequestPost as provision } from "../functions/api/tenant/provision";
import { onRequestGet as tenantMe } from "../functions/api/tenant/me";
import { onRequestPost as lockBrand } from "../functions/api/tenant/lock-brand";
import { onRequestPost as uploadAsset } from "../functions/api/assets/upload";
import { onRequestGet as getProducts } from "../functions/api/db/products";
import { onRequestPost as postProducts } from "../functions/api/db/products";
import { onRequestGet as getCampaigns } from "../functions/api/db/campaigns";
import { onRequestPost as runCampaign } from "../functions/api/db/campaigns/run";
import { onRequestGet as getStats } from "../functions/api/db/stats";

type BV = string | number | null;
type Row = Record<string, unknown>;

class MockStmt {
  values: BV[] = [];
  constructor(public sql: string, private db: MockDB) {}
  bind(...v: BV[]) { this.values = v; return this; }
  async first<T>(): Promise<T | null> {
    this.db.calls.push(this.sql);
    return this.db.first<T>(this.sql, this.values);
  }
  async all<T>(): Promise<{ results: T[] }> {
    this.db.calls.push(this.sql);
    return { results: this.db.all<T>(this.sql, this.values) };
  }
  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    this.db.calls.push(this.sql);
    return this.db.run(this.sql, this.values);
  }
}

class MockDB {
  calls: string[] = [];
  activationKeys: Row[] = [];
  brands: Row[] = [];
  products: Row[] = [];
  assets: Row[] = [];
  campaigns: Row[] = [];
  creatives: Row[] = [];
  promotions: Row[] = [];
  settings: Row[] = [];
  quotaLedger: Row[] = [];
  researchClaims: Row[] = [];
  sources: Row[] = [];
  stockChecks: Row[] = [];

  prepare(sql: string) { return new MockStmt(sql, this); }
  async batch(stmts: MockStmt[]) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }

  first<T>(sql: string, v: BV[]): T | null {
    const s = sql.toLowerCase();
    if (s.includes("from activation_keys") && s.includes("key_hash = ?")) {
      return (this.activationKeys.find((r) => r.key_hash === v[0]) ?? null) as T | null;
    }
    if (s.includes("from activation_keys") && s.includes("id = ?")) {
      return (this.activationKeys.find((r) => r.id === v[0]) ?? null) as T | null;
    }
    if (s.includes("count(*)") && s.includes("activation_keys")) {
      return { count: this.activationKeys.length } as T;
    }
    if (s.includes("from brands") && s.includes("slug = ?")) {
      return (this.brands.find((r) => r.slug === v[0]) ?? null) as T | null;
    }
    if (s.includes("from brands") && s.includes("order by created_at asc limit 1")) {
      return (this.brands[0] ?? null) as T | null;
    }
    if (s.includes("from products p") && s.includes("join brands b") && s.includes("where p.id = ?")) {
      const id = v[0]; const tenant = v[1];
      const p = this.products.find((r) => r.id === id && (!tenant || r.tenant_key_id === tenant));
      if (!p) return null;
      const b = this.brands.find((r) => r.id === p.brand_id) ?? {};
      return { ...p, brand_arabic: b.name_arabic, brand_slug: b.slug } as T;
    }
    if (s.includes("from products") && s.includes("where id = ?")) {
      const id = v[0]; const tenant = s.includes("tenant_key_id = ?") ? v[1] : null;
      return (this.products.find((r) => r.id === id && (!tenant || r.tenant_key_id === tenant)) ?? null) as T | null;
    }
    if (s.includes("from products") && s.includes("tenant_key_id = ?") && s.includes("sku = ?")) {
      return (this.products.find((r) => r.tenant_key_id === v[0] && r.sku === v[1]) ?? null) as T | null;
    }
    if (s.includes("from products") && s.includes("tenant_key_id = ?") && s.includes("lower(name_arabic) = lower(?)")) {
      return (this.products.find((r) => r.tenant_key_id === v[0] && String(r.name_arabic).toLowerCase() === String(v[1]).toLowerCase()) ?? null) as T | null;
    }
    if (s.includes("select id from products where id = ?")) {
      const p = this.products.find((r) => r.id === v[0] && (!s.includes("tenant_key_id") || r.tenant_key_id === v[1]));
      return (p ? { id: p.id } : null) as T | null;
    }
    if (s.includes("count(*)") && s.includes("from products")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[0] : null;
      const rows = this.products.filter((r) => !tenant || r.tenant_key_id === tenant);
      return { count: rows.length } as T;
    }
    if (s.includes("count(*)") && s.includes("brands")) return { count: this.brands.length } as T;
    if (s.includes("count(*)") && s.includes("product_assets")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[v.length-1] : null;
      let rows = this.assets.filter((r) => !tenant || r.tenant_key_id === tenant);
      if (s.includes("image_type = 'reference'")) rows = rows.filter((r)=>r.image_type==='reference' && r.image_url);
      return { count: rows.length } as T;
    }
    if (s.includes("count(*)") && s.includes("campaigns")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[0] : null;
      return { count: this.campaigns.filter((r) => !tenant || r.tenant_key_id === tenant).length } as T;
    }
    if (s.includes("count(*)") && s.includes("creatives")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[0] : null;
      return { count: this.creatives.filter((r) => !tenant || r.tenant_key_id === tenant).length } as T;
    }
    return null;
  }

  all<T>(sql: string, v: BV[]): T[] {
    const s = sql.toLowerCase();
    if (s.includes("from products p") && s.includes("limit ? offset ?")) {
      const tenantIdx = s.indexOf("p.tenant_key_id = ?") >= 0 ? 0 : -1;
      const tenant = tenantIdx >= 0 ? v[tenantIdx] : null;
      const limit = Number(v[v.length - 2] ?? 50);
      const offset = Number(v[v.length - 1] ?? 0);
      return this.products.filter((r) => !tenant || r.tenant_key_id === tenant).slice(offset, offset + limit).map((p) => {
        const b = this.brands.find((r) => r.id === p.brand_id) ?? {};
        return { ...p, brand_arabic: b.name_arabic, brand_english: b.name_english, brand_slug: b.slug, image_url: null, image_source: null } as T;
      });
    }
    if (s.includes("select distinct category")) return [] as T[];
    if (s.includes("from campaigns")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[0] : null;
      return this.campaigns.filter((r) => !tenant || r.tenant_key_id === tenant) as T[];
    }
    if (s.includes("from product_assets")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[v.length - 1] : null;
      return this.assets.filter((r) => !tenant || r.tenant_key_id === tenant) as T[];
    }
    if (s.includes("from creatives")) {
      const tenant = s.includes("tenant_key_id = ?") ? v[0] : null;
      return this.creatives.filter((r) => !tenant || r.tenant_key_id === tenant) as T[];
    }
    return [] as T[];
  }

  run(sql: string, v: BV[]) {
    const s = sql.toLowerCase();
    if (s.startsWith("insert into activation_keys")) {
      // INSERT (id,key_hash,label,status,created_at,expires_at,brand_locked,quota_total,quota_used)
      this.activationKeys.push({ id: v[0], key_hash: v[1], label: v[2], status: 'active', created_at: v[3], expires_at: v[4], brand_locked: 0, locked_brand_name: null, locked_industry: null, locked_logo_url: null, locked_brand_json: null, locked_at: null, quota_total: v[5] ?? 0, quota_used: 0 });
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("update activation_keys") && s.includes("locked_brand_name")) {
      const id = v[v.length - 1];
      const row = this.activationKeys.find((r) => r.id === id);
      if (row && row.brand_locked !== 1) {
        Object.assign(row, { locked_brand_name: v[0], locked_industry: v[1], locked_logo_url: v[2], locked_brand_json: v[3], locked_at: v[4], brand_locked: 1 });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (s.startsWith("update activation_keys") && s.includes("locked_logo_url = ?")) {
      const row = this.activationKeys.find((r) => r.id === v[1]);
      if (row) row.locked_logo_url = v[0];
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("insert into brands")) {
      const keys = sql.match(/\(([^)]+)\)/)?.[1]?.split(",").map((x) => x.trim()) ?? [];
      const row: Row = {}; keys.forEach((k,i)=>row[k]=v[i]);
      if (!row.identity_status) row.identity_status = 'needs_verification';
      this.brands.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("insert into products")) {
      const keys = sql.match(/\(([^)]+)\)/)?.[1]?.split(",").map((x) => x.trim().replace(/"/g, "")) ?? [];
      const row: Row = {};
      // map bind params to placeholders in order
      const placeholders = (sql.toLowerCase().split("values")[1]||"").split(")")[0];
      const cols: string[] = [];
      let vi=0;
      for (const k of keys) {
        // detect if this key position is literal in values by counting ? in order
        cols.push(k);
      }
      // simple: assign by key order but only for ? slots
      const valSlots = placeholders.split(",").map(x=>x.trim());
      let bi=0;
      for (let i=0;i<keys.length;i++){ const slot=valSlots[i]||"?"; if(slot==="?"||slot.includes("?")) { row[keys[i]]=v[bi++]; } else { row[keys[i]]=slot.replace(/'/g,""); } }
      if (row.verification_status===undefined) row.verification_status='needs_verification';
      this.products.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("update products") && s.includes("set")) {
      const id = v[v.length - 1];
      const row = this.products.find((r) => r.id === id);
      if (row) { row.updated_at = Date.now(); }
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (s.startsWith("insert into product_assets")) {
      const keys = sql.match(/\(([^)]+)\)/)?.[1]?.split(",").map((x) => x.trim()) ?? [];
      const row: Row = {}; keys.forEach((k, i) => (row[k] = v[i])); this.assets.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("update product_assets")) {
      return { success: true, meta: { changes: 0 } };
    }
    if (s.startsWith("insert into campaigns")) {
      const keys = sql.match(/\(([^)]+)\)/)?.[1]?.split(",").map((x) => x.trim()) ?? [];
      const row: Row = {}; keys.forEach((k, i) => (row[k] = v[i])); this.campaigns.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("insert into creatives")) {
      const keys = sql.match(/\(([^)]+)\)/)?.[1]?.split(",").map((x) => x.trim()) ?? [];
      const row: Row = {}; keys.forEach((k, i) => (row[k] = v[i])); this.creatives.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("insert into quota_ledger")) {
      this.quotaLedger.push({ tenant_key_id: v[1], delta: v[3], reason: v[4] });
      return { success: true, meta: { changes: 1 } };
    }
    if (s.startsWith("insert into business_settings") || s.startsWith("update business_settings")) {
      this.settings.push({ key: v[0], value: v[1], tenant_key_id: v[3] });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 0 } };
  }
}

function ctx(env: any, url: string, init: RequestInit = {}) {
  const req = new Request(url, init);
  return { request: req, env, params: {}, data: undefined, next: async () => new Response(""), waitUntil() {}, passThroughOnException() {} } as any;
}
async function json(res: Response) { return res.json() as Promise<any>; }

async function provisionKey(db: MockDB, label: string) {
  const res = await provision(ctx({ DB: db, ADMIN_API_KEY: "admin" }, "https://x/api/tenant/provision", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": "admin" }, body: JSON.stringify({ label }) }));
  const body = await json(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return body.access_key as string;
}

/** Runs a handler through the real /api middleware with ADMIN_API_KEY bound. */
async function throughApiMiddleware(
  handler: (context: any) => Promise<Response> | Response,
  db: MockDB,
  url: string,
  init: RequestInit = {},
) {
  const base = ctx({ DB: db, ADMIN_API_KEY: "admin" }, url, init);
  return apiMiddleware({ ...base, next: async () => handler(base) } as any);
}

function imageForm(name: string) {
  const form = new FormData();
  form.append("imageFile", new File([new Uint8Array([137, 80, 78, 71])], `${name}.png`, { type: "image/png" }));
  form.append("autoCreate", "true");
  return form;
}

async function run() {
  const db = new MockDB();

  // Valid key
  const keyA = await provisionKey(db, "A");
  const meA = await tenantMe(ctx({ DB: db }, "https://x/api/tenant/me", { headers: { "x-access-key": keyA } }));
  assert.equal(meA.status, 200);

  // Invalid key
  const bad = await tenantMe(ctx({ DB: db }, "https://x/api/tenant/me", { headers: { "x-access-key": "arh_bad" } }));
  assert.equal(bad.status, 401);

  // Expired key
  const keyExp = await provisionKey(db, "Exp");
  const rowExp = db.activationKeys.find((r) => r.label === "Exp")!;
  rowExp.expires_at = Math.floor(Date.now() / 1000) - 10;
  const expRes = await tenantMe(ctx({ DB: db }, "https://x/api/tenant/me", { headers: { "x-access-key": keyExp } }));
  assert.equal(expRes.status, 403);
  const expBody = await json(expRes);
  assert.equal(expBody.code, "access_key_expired");

  // Lock brand once, then 403 on company/industry change
  const lock1 = await lockBrand(ctx({ DB: db }, "https://x/api/tenant/lock-brand", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyA }, body: JSON.stringify({ brand_name: "Acme", industry: "Bakery" }) }));
  assert.equal(lock1.status, 200);
  const lock2 = await lockBrand(ctx({ DB: db }, "https://x/api/tenant/lock-brand", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyA }, body: JSON.stringify({ brand_name: "Acme", industry: "Bakery" }) }));
  assert.equal(lock2.status, 200);
  const lock3 = await lockBrand(ctx({ DB: db }, "https://x/api/tenant/lock-brand", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyA }, body: JSON.stringify({ brand_name: "Other", industry: "Bakery" }) }));
  assert.equal(lock3.status, 403);
  const lock3Body = await json(lock3);
  assert.equal(lock3Body.code, "brand_locked");

  // Unlimited generation for active non-expired key (no quota-cap failure) - simulate by checking stats/campaign access not quota-blocked; runCampaign may fail for missing product but not quota
  // We'll assert provisioned key with quota_total 0 is accepted and tenant/me shows active
  const keyU = await provisionKey(db, "Unlimited");
  await lockBrand(ctx({ DB: db }, "https://x/api/tenant/lock-brand", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyU }, body: JSON.stringify({ brand_name: "U", industry: "Retail" }) }));
  const meU = await json(await tenantMe(ctx({ DB: db }, "https://x/api/tenant/me", { headers: { "x-access-key": keyU } })));
  assert.equal(meU.tenant.status, "active");

  // Two-key isolation: products/assets/campaigns/creatives
  const keyB = await provisionKey(db, "B");
  await lockBrand(ctx({ DB: db }, "https://x/api/tenant/lock-brand", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyB }, body: JSON.stringify({ brand_name: "Beta", industry: "Industrial" }) }));
  // create product under A
  const pA = await postProducts(ctx({ DB: db }, "https://x/api/db/products", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyA }, body: JSON.stringify([{ name_arabic: "منتج أ", category: "food" }]) }));
  assert.equal(pA.status, 200);
  const pB = await postProducts(ctx({ DB: db }, "https://x/api/db/products", { method: "POST", headers: { "content-type": "application/json", "x-access-key": keyB }, body: JSON.stringify([{ name_arabic: "منتج ب", category: "industrial" }]) }));
  assert.equal(pB.status, 200);
  const listA = await json(await getProducts(ctx({ DB: db }, "https://x/api/db/products?limit=10", { headers: { "x-access-key": keyA } })));
  const listB = await json(await getProducts(ctx({ DB: db }, "https://x/api/db/products?limit=10", { headers: { "x-access-key": keyB } })));
  assert.ok(listA.products.every((p: any) => p.name_arabic !== "منتج ب"));
  assert.ok(listB.products.every((p: any) => p.name_arabic !== "منتج أ"));

  // assets isolation via DB state
  db.assets.push({ id: "a1", tenant_key_id: db.activationKeys.find((r)=>r.label==="A")!.id, product_id: "pa", image_type:"reference", image_url:"https://x/a.png" });
  db.assets.push({ id: "b1", tenant_key_id: db.activationKeys.find((r)=>r.label==="B")!.id, product_id: "pb", image_type:"reference", image_url:"https://x/b.png" });
  const statsA = await json(await getStats(ctx({ DB: db }, "https://x/api/db/stats", { headers: { "x-access-key": keyA } })));
  const statsB = await json(await getStats(ctx({ DB: db }, "https://x/api/db/stats", { headers: { "x-access-key": keyB } })));
  assert.equal(statsA.stats.referenceImages, 1);
  assert.equal(statsB.stats.referenceImages, 1);

  // campaigns/creatives isolation
  db.campaigns.push({ id: "cA", tenant_key_id: db.activationKeys.find((r)=>r.label==="A")!.id });
  db.campaigns.push({ id: "cB", tenant_key_id: db.activationKeys.find((r)=>r.label==="B")!.id });
  db.creatives.push({ id: "crA", tenant_key_id: db.activationKeys.find((r)=>r.label==="A")!.id });
  db.creatives.push({ id: "crB", tenant_key_id: db.activationKeys.find((r)=>r.label==="B")!.id });
  const campA = await json(await getCampaigns(ctx({ DB: db }, "https://x/api/db/campaigns", { headers: { "x-access-key": keyA } })));
  const campB = await json(await getCampaigns(ctx({ DB: db }, "https://x/api/db/campaigns", { headers: { "x-access-key": keyB } })));
  const cA = campA.campaigns || campA.data || [];
  const cB = campB.campaigns || campB.data || [];
  assert.ok(cA.every((c:any)=>c.id!=="cB"));
  assert.ok(cB.every((c:any)=>c.id!=="cA"));

  // Auto-create product from uploaded image under locked tenant industry
  const fd = new FormData();
  fd.append("imageFile", new File([new Uint8Array([137,80,78,71])], "industrial-pump.png", { type: "image/png" }));
  fd.append("autoCreate", "true");
  const up = await uploadAsset(ctx({ DB: db }, "https://x/api/assets/upload", { method: "POST", headers: { "x-access-key": keyB }, body: fd }));
  const upBody = await json(up);
  if(up.status!==200){console.error(upBody); console.error(db.products);}
  assert.equal(up.status, 200, JSON.stringify(upBody));
  assert.equal(upBody.success, true);
  assert.equal(upBody.autoCreated, true);
  assert.ok(upBody.product?.id);
  const created = db.products.find((p) => p.id === upBody.product.id);
  assert.ok(created);
  assert.equal(created.tenant_key_id, db.activationKeys.find((r)=>r.label==="B")!.id);

  // --- Middleware: one-time brand setup works with the tenant key ----------
  const keyLock = await provisionKey(db, "LockViaMiddleware");
  const lockViaKey = await throughApiMiddleware(
    lockBrand,
    db,
    "https://x/api/tenant/lock-brand",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-key": keyLock },
      body: JSON.stringify({ brand_name: "Lock Co", industry: "Retail" }),
    },
  );
  const lockViaKeyBody = await json(lockViaKey);
  assert.equal(lockViaKey.status, 200, JSON.stringify(lockViaKeyBody));
  assert.equal(lockViaKeyBody.tenant.brand_locked, true);

  // --- Middleware: tenant access keys authorize normal studio writes --------
  // ADMIN_API_KEY is bound here, but a valid annual key is enough for uploads
  // and product creation. This is the dashboard's production failure mode.
  const tenantUpload = await throughApiMiddleware(
    uploadAsset,
    db,
    "https://x/api/assets/upload",
    { method: "POST", headers: { "x-access-key": keyA }, body: imageForm("tenant-key-upload") },
  );
  const tenantUploadBody = await json(tenantUpload);
  assert.equal(tenantUpload.status, 200, JSON.stringify(tenantUploadBody));
  assert.equal(tenantUploadBody.success, true);
  assert.equal(tenantUploadBody.autoCreated, true);

  const tenantProducts = await throughApiMiddleware(
    postProducts,
    db,
    "https://x/api/db/products",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${keyA}` },
      body: JSON.stringify([{ name_arabic: "منتج بمفتاح الوصول", category: "food" }]),
    },
  );
  const tenantProductsBody = await json(tenantProducts);
  assert.equal(tenantProducts.status, 200, JSON.stringify(tenantProductsBody));

  const cookieUpload = await throughApiMiddleware(
    uploadAsset,
    db,
    "https://x/api/assets/upload",
    {
      method: "POST",
      headers: { cookie: `al_rahma_access_key=${encodeURIComponent(keyB)}` },
      body: imageForm("cookie-upload"),
    },
  );
  const cookieUploadBody = await json(cookieUpload);
  assert.equal(cookieUpload.status, 200, JSON.stringify(cookieUploadBody));

  // Missing/invalid/expired keys report the real reason, never "admin key".
  const missingKey = await throughApiMiddleware(
    uploadAsset,
    db,
    "https://x/api/assets/upload",
    { method: "POST", body: imageForm("missing-key") },
  );
  const missingBody = await json(missingKey);
  assert.equal(missingKey.status, 401);
  assert.equal(missingBody.code, "access_key_required");
  assert.doesNotMatch(String(missingBody.error), /admin key/i);

  const invalidKey = await throughApiMiddleware(
    postProducts,
    db,
    "https://x/api/db/products",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-key": "arh_invalid" },
      body: JSON.stringify([{ name_arabic: "منتج غير مصرح", category: "food" }]),
    },
  );
  const invalidBody = await json(invalidKey);
  assert.equal(invalidKey.status, 401);
  assert.equal(invalidBody.code, "access_key_invalid");
  assert.doesNotMatch(String(invalidBody.error), /admin key/i);

  const expiredKey = await throughApiMiddleware(
    uploadAsset,
    db,
    "https://x/api/assets/upload",
    { method: "POST", headers: { "x-access-key": keyExp }, body: imageForm("expired") },
  );
  const expiredBody = await json(expiredKey);
  assert.equal(expiredKey.status, 403);
  assert.equal(expiredBody.code, "access_key_expired");

  // Provisioning remains admin-only even for a valid tenant key.
  const tenantProvision = await throughApiMiddleware(
    provision,
    db,
    "https://x/api/tenant/provision",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-key": keyA },
      body: JSON.stringify({ label: "Tenant cannot provision" }),
    },
  );
  const tenantProvisionBody = await json(tenantProvision);
  assert.equal(tenantProvision.status, 401);
  assert.equal(tenantProvisionBody.code, "admin_key_required");

  console.log("multi-tenant phase4 tests passed");
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
