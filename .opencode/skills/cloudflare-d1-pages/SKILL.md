---
name: Cloudflare D1 & Pages Functions
description: Use when adding or changing D1 schema, migrations, queries, or Pages Functions in Social-Post-Agent (binding DB -> makhzan-al-rahma), including local/remote Pages testing and safe production verification.
---

# Cloudflare D1 & Pages Functions

Scope: `functions/api/**`, `migrations/**`, `wrangler.toml`, and any D1 access.

## Non-negotiable safety

- Production database: `makhzan-al-rahma` (binding `DB`). It holds **177 real
  products**. Never `DROP`, `TRUNCATE`, `DELETE`, or bulk `UPDATE` against it.
- Do not edit `0000_baseline.sql` or `0001_product_research.sql`. They are
  applied. Add a new numbered migration instead.
- Never rewrite an applied migration; fix forward.
- Never put SQL credentials or API keys in source. Pages Functions read only
  `env.DB`.

## Writing queries

- Always parameterize:

  ```ts
  await env.DB.prepare(
    "SELECT id, name_arabic FROM products WHERE brand_id = ? AND id = ? LIMIT ?",
  ).bind(brandId, productId, limit).all<ProductRow>();
  ```

- Never build SQL by string interpolation of user input. Dynamic `WHERE`
  clauses may append fixed fragments with `?` placeholders only.
- Validate before binding: `limit` 1–100, `offset` >= 0, strings trimmed and
  length-capped (~100 chars). Invalid input returns `400` without hitting D1.
- Prefer `COUNT(*)` + page query in `Promise.all`, and return the
  `{ success, data, total, limit, offset, hasMore }` shape used by
  `functions/api/db/products.ts`.
- Use `LIKE ?` with `%term%` bound values; do not interpolate the pattern.
- Never select `*` for public endpoints; list columns explicitly.

## Adding a migration

1. Create `migrations/000N_snake_case.sql` (next number; never reuse).
2. Make it additive and idempotent:
   - `CREATE TABLE IF NOT EXISTS ...`
   - `CREATE INDEX IF NOT EXISTS ...`
   - `ALTER TABLE ... ADD COLUMN ...` (only when unavoidable)
3. Include foreign keys explicitly; D1/SQLite requires a `UNIQUE` target for
   composite FKs (see `0001_product_research.sql`).
4. Inspect production read-only first:

   ```powershell
   npx wrangler d1 execute makhzan-al-rahma --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
   npx wrangler d1 execute makhzan-al-rahma --remote --command "SELECT COUNT(*) AS products FROM products"
   ```

5. Apply and record in one step (do **not** use `d1 execute --file` for schema
   changes; it bypasses `d1_migrations`):

   ```powershell
   npx wrangler d1 migrations list makhzan-al-rahma --remote
   npx wrangler d1 migrations apply makhzan-al-rahma --remote
   ```

6. Verify bookkeeping and data:

   ```powershell
   npx wrangler d1 execute makhzan-al-rahma --remote --command "SELECT name FROM d1_migrations ORDER BY id"
   npx wrangler d1 execute makhzan-al-rahma --remote --command "SELECT COUNT(*) AS products FROM products"
   ```

   Expected: new migration listed; product count unchanged (177) unless the
   task explicitly changes data.

## Testing Pages Functions

Build first — Pages Functions serve the static export:

```powershell
npm run build
```

Local (uses a local D1 shadow database; never production):

```powershell
npx wrangler pages dev out --d1 DB=makhzan-al-rahma
```

Remote resources against the preview:

```powershell
npx wrangler pages dev out --d1 DB=makhzan-al-rahma --remote
```

Then exercise every route:

```powershell
curl.exe -s "http://localhost:8788/api/db/stats"
curl.exe -s "http://localhost:8788/api/db/brands"
curl.exe -s "http://localhost:8788/api/db/products?limit=5&offset=0"
curl.exe -s "http://localhost:8788/api/db/research?product_id=<real-id>"
```

Rules:

- Use a real product id from D1 for research checks.
- Expect `200` + `success: true`; unknown product `404`; bad params `400`.
- Preview verification runs against the deployed preview host, never against
  production, and stays read-only.
- Do not run Cron or scheduled jobs as part of testing.

## Unit tests without D1

`scripts/test-db-api.ts` mocks `D1Database`. When adding a query, extend the
mock and assert:

- bound values and their order,
- filtered count vs page rows,
- validation short-circuits before any query,
- error envelope behavior.

## Failure playbook

- `no such table` in preview → migration not applied; check
  `d1_migrations` and apply with `migrations apply`.
- `500` on an endpoint that worked locally → binding missing in the Pages
  project or wrong database name; verify `wrangler.toml` and the project
  settings.
- Migration halfway → Wrangler rolls back the batch; retry after fixing the
  SQL. Never hand-edit `d1_migrations`.
