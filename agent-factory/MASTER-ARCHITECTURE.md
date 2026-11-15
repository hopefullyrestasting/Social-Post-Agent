# Agent Factory — Master Architecture (Al Rahma Seed)

This repository is the **reference product** for Al Rahma Warehouse and the seed for a reusable agent factory. The core creative/commercial engine is designed so it can be reused for future clients by swapping configuration and data, not by forking logic.

## 1. Fixed stack (do not replace)

- **Next.js 16** App Router, `output: "export"`, static output in `out/`.
- **TypeScript** strict, `@/*` → `src/*`.
- **Cloudflare Pages Functions** (`functions/api/**`) for server-side data access.
- **Cloudflare D1** as the only datastore (binding `DB`). No Prisma, no SQLite.
- **Tailwind CSS v4** UI, Arabic-first RTL dashboard.
- Product imagery is **authentic packshot compositing only** — AI/generative models are never used to redraw packaging, labels, or logos.

## 2. Separation of concerns

### BrandConfig is the only identity source
- **`src/lib/al-rahma/brand-core.ts`** is the single source of truth for brand name, contact details (phone/WhatsApp), activity text, visual tokens (canvas 1080×1920 portrait, white + subtle silver mesh, Cairo/Tajawal), and commercial defaults (currency label, Cairo timezone, lead days).
- All other modules (copywriter, overlay, quality gate, dashboard, APIs that need identity) **import from BrandConfig**. Tests enforce no hardcoded brand/phone/WhatsApp outside `brand-core.ts`.
- Rebranding a client = provide a new BrandConfig module/package and wire imports; engine behavior stays the same.

### Core engine (brand-agnostic logic, config-driven)
Located in `src/lib/al-rahma/`:

| Module | Responsibility |
| --- | --- |
| `arabic-copywriter.ts` | Deterministic Arabic RTL copy from verified product facts + BrandConfig CTA/footer; injects occasion greeting; never invents claims/prices. |
| `background-provider.ts` | Background seam: deterministic white/silver-mesh studio layers with optional env adapters; fallback-safe. |
| `overlay-system.ts` | Pure SVG composer (1080×1920): brand chip, authentic packshot compositing, depth/lighting, controlled promo badge, occasion ribbon, availability, CTA/footer. No generative packaging. |
| `quality-gate.ts` | Pre-publish checks: verified source/claims, no invented price/promo/medical claims, layout/legibility, authentic packshot present, controlled promo/occasion rules. Blocks output on failure. |
| `production-engine.ts` | Orchestrates copy → background → overlay → quality gate; produces 2 distinct variants per product (`hero-clean`, `studio-angle`) with metadata. |
| `commercial.ts` / `dates.ts` | Cairo-time windowing, promo validation (server-derived price), 48h/lead-day occasion resolution and greeting normalization. |
| `export.ts` (client) | Client-side SVG→PNG (1080×1920) rasterization with packshot inlining and ZIP bundling for WhatsApp Status delivery. |

**Rule:** the engine consumes *inputs* (product facts, verified claims, authentic packshot URL, optional validated promo/occasion, BrandConfig). It must never fetch secrets, invent data, or redraw packaging.

### Data & verification layer (D1 + Pages Functions)
- **Migrations** in `migrations/` are additive/idempotent only; schema evolves forward (never rewrite applied migrations, never drop/truncate product data).
- **`/api/db/*`** Pages Functions provide parameterized, validated read/write access. Writes under `/api/db/*` are admin-protected by `X-Admin-Key` when `ADMIN_API_KEY` is bound (middleware + constant-time compare); preview may run in explicit `unconfigured-preview` mode.
- **Product truths are separate:** identity (`products`), market existence, warehouse stock, and claim verification (`product_information_sources` + `product_research_claims`). A verified source does not verify an unrelated claim; "available in Egypt" ≠ in warehouse.
- **Research ingestion** (`/api/db/research/ingest`, `/bulk-ingest`) is idempotent, category-consistent per bulk batch, and records verified sources, verified benefit/usage claims, and primary reference assets.
- **Campaigns** (`/api/db/campaigns`, `/api/db/campaigns/run`) are manual (no Cron): select up to 5 eligible products (`verification_status='verified'` + verified primary reference image), prioritize not advertised in last 7 days, apply active in-window promo/occasion, generate 2 variants/product, persist `campaigns`/`creatives` and update `products.last_advertised_at`.

### UI layer
- **`src/app/dashboard/page.tsx`** + components in `src/components/al-rahma/` provide catalog view, research/verify, promo/calendar controls, bulk ingest, ad preview, and **Campaign Gallery** (manual batch run, grouped 1080×1920 creatives, one-click PNG and ZIP download).

## 3. Creative & safety invariants

- Canvas **1080×1920** portrait. Background clean white `#FFFFFF` with subtle silver mesh. Strict Arabic RTL typography hierarchy.
- **Authentic packshot only** (composited/scaled/placed); labels/logos never regenerated.
- **No unverified claims**, no invented prices/discounts/urgency/stock. Promo badge renders only for validated, in-window, internally consistent promotions; occasions only inside lead window (Cairo time).
- Quality Gate must pass before a creative is considered publishable; blocked/invalid states are surfaced, not hidden.

## 4. Reuse model for a new client

1. **Clone** the seed repo and keep the core engine modules stable.
2. **BrandConfig:** create/replace `brand-core.ts` with the new client identity, contacts, fonts/colors, and commercial defaults (tests will require all references to flow from it).
3. **Data:** provision a new D1 database, bind as `DB`, apply additive migrations, seed brands/products/catalog.
4. **Secrets/bindings:** set `ADMIN_API_KEY` in the target Pages environment; never commit secrets.
5. **Research & verification:** ingest authentic sources, real packshots, and factual claims per product until eligible for ads.
6. **Commercial/calendar:** configure promotions and cultural calendar as controlled records (no ad-hoc price text).
7. **Operate:** manual campaign runs produce 10 WhatsApp-ready creatives (5×2) with downloadable PNG/ZIP.

This keeps the engine deterministic and testable while allowing each client to differ only by configuration, data, and verified assets.
