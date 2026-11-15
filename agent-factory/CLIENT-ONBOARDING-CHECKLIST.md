# Client Onboarding Checklist (Agent Factory)

Use this checklist to clone the Al Rahma seed into a new client deployment. Do **not** merge client-specific changes back to `main`/seed branches without approval, and never weaken the safety invariants (authentic packshots only, no invented claims/prices, additive migrations, no secrets in repo).

## A. Clone & environment

- [ ] **Clone** the repository and create a dedicated working branch for the client.
- [ ] Install dependencies: `npm ci` (or `npm install`) with Node/npm compatible with the repo.
- [ ] Confirm the fixed stack remains unchanged: Next.js 16 App Router (`output: "export"`), TypeScript strict, Cloudflare Pages Functions, Cloudflare D1, Tailwind v4. **No Prisma/SQLite.**
- [ ] Run baseline checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## B. Brand configuration (single source of truth)

- [ ] Edit/create **`src/lib/al-rahma/brand-core.ts`** with the new client's identity:
  - Brand name(s) and activity/positioning text.
  - Contact: phone and WhatsApp URL (kept consistent) — **all UI/copy/footer must read from config**.
  - Visual tokens: 1080×1920 portrait, white `#FFFFFF` + subtle silver mesh styling, Arabic RTL fonts (e.g. Cairo/Tajawal), safe layout defaults.
  - Commercial defaults: currency label, timezone (default Africa/Cairo unless client differs), calendar lead days.
- [ ] Ensure **no brand names, phone numbers, or WhatsApp links are hardcoded** outside `brand-core.ts` (single-source test will catch violations).
- [ ] Update any brand-scoped seed content/docs as needed, without altering engine safety behavior.

## C. Cloudflare D1 & Pages bindings

- [ ] Create a **new D1 database** for the client (do not reuse `makhzan-al-rahma`).
- [ ] Update `wrangler.toml` bindings for the target environment: `binding = "DB"`, `database_name`, `database_id` for the new database.
- [ ] Apply migrations **additively and in order** (never edit applied migrations):
  - Local/preview/remote as appropriate: `npx wrangler d1 migrations apply <database_name> --remote` (or `--local` for dev).
  - Confirm `d1_migrations` reflects applied versions; schema changes must be `IF NOT EXISTS`/additive.
- [ ] Seed/populate client catalog data (`brands`, `products`, and required references) without dropping or truncating existing rows. Keep identity, market existence, warehouse stock, and claim verification as separate truths.

## D. Admin access & secrets

- [ ] Generate a strong `ADMIN_API_KEY` and bind it in the Cloudflare Pages project (Preview/Production as required). **Never commit keys or secrets.**
- [ ] Verify write protection: `POST/PUT/PATCH/DELETE` under `/api/db/*` require `X-Admin-Key` when configured (401 on missing/invalid); responses may indicate `unconfigured-preview` only where intentionally unbound.
- [ ] Operators store the key locally in the dashboard (browser `localStorage`) — do not log or expose it.

## E. Research, verification & assets (required before ads)

- [ ] For each product to advertise, collect **authentic, traceable evidence**:
  - Source URL (prefer manufacturer/official brand site; otherwise reputable retailer, recorded clearly) and source type.
  - **Genuine packshot image URL** (authentic packaging). Never AI-regenerate packaging/labels/logos.
  - Factual Arabic **benefit/usage claims** only where supported — **no medical claims**, no invented specs/prices.
- [ ] Ingest via `/api/db/research/ingest` or `/api/db/research/bulk-ingest` (bulk requires same-category batches, 1–50 records, validated/idempotent).
- [ ] Confirm eligibility per product: `verification_status='verified'` **and** a verified primary reference image in `product_assets`. Review `product_information_sources` and `product_research_claims` for correctness.

## F. Commercial controls & calendar

- [ ] Configure promotions via `/api/db/promos` only with real, time-bounded records; final price is server-derived/validated (no ad-hoc price text in creatives).
- [ ] Configure cultural occasions via `/api/db/calendar` (Egypt/Cairo lead-window defaults or client-specific as agreed). Greetings render only inside the active window.
- [ ] Validate behavior in preview: expired/invalid promos must not render as valid offers; out-of-window occasions must not render.

## G. Campaign workflow (manual, WhatsApp-ready)

- [ ] Open `/dashboard` and verify catalog/research stats reflect ingested verified products.
- [ ] Run **"توليد دفعة اليوم (5 منتجات × صورتين)"** (calls `POST /api/db/campaigns/run`, manual only — **no Cloudflare Cron**):
  - Selects up to 5 eligible products (verified + verified primary image), prioritizing not advertised in last 7 days (`last_advertised_at`).
  - Generates 2 variants per product (`hero-clean`, `studio-angle`) = up to 10 creatives (1080×1920).
  - Persists `campaigns`/`creatives` and updates `products.last_advertised_at`.
  - If fewer than 5 eligible, generates for available and reports the count.
- [ ] Review creatives in the Campaign Gallery; download **PNG (1080×1920)** per creative and **Download All as ZIP** for WhatsApp Status.
- [ ] Confirm Quality Gate outcomes: no unverified claims, no invented pricing/stock, authentic packshot present.

## H. Verification, deploy & handoff

- [ ] Run before commit/push: `npm test`, `npm run typecheck`, `npm run lint` (0 errors), `npm run build`.
- [ ] Commit with a clear message; push to the designated branch (not `main` unless explicitly approved).
- [ ] Deploy/preview on Cloudflare Pages and verify against the client D1 (read-only checks unless a write is explicitly intended and authorized).
- [ ] Document for the client: bound D1 name/id, admin key handling, how to bulk-ingest verified products, how to run daily batches, and that automation/Cron is **not** enabled by default.
- [ ] Final acceptance: 5+ verified products with primary images produce a successful manual batch with downloadable 1080×1920 PNG/ZIP creatives passing the Quality Gate.
