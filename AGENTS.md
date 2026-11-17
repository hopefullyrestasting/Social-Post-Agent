# AGENTS.md — Social-Post-Agent (Al Rahma Warehouse)

This repository is the **reference product** for Al Rahma Warehouse and the seed
for a reusable agent factory. Treat the existing stack as fixed: extend it, do
not redesign or replace it.

## Stack (do not replace)

- **Next.js 16** App Router with `output: "export"` — static files in `out/`.
- **TypeScript** strict mode (`tsconfig.json`), path alias `@/*` → `src/*`.
- **Cloudflare Pages Functions** in `functions/api/` (GET-only today).
- **Cloudflare D1** binding `DB` → database `makhzan-al-rahma`.
- **Tailwind CSS v4** via `@tailwindcss/postcss`, Arabic RTL UI.
- Current branch of record: `fix/al-rahma-dashboard`. Do not merge to `main`
  without explicit approval.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app/` | Pages: `/` landing, `/dashboard` D1 dashboard (client component) |
| `src/lib/al-rahma/brand-core.ts` | **Single source of truth** for brand identity, contact, theme |
| `src/lib/al-rahma/arabic-copywriter.ts` | Arabic copy templates (brand/phone injected from config) |
| `src/lib/al-rahma/overlay-system.ts` | Pure SVG overlay (brand chip, packshot, availability, CTA, footer) |
| `src/lib/al-rahma/quality-gate.ts` | Pre-publish checks, including source verification |
| `src/lib/al-rahma/production-engine.ts` | Copy → SVG → Quality Gate orchestration (2 variants) |
| `src/lib/al-rahma/background-provider.ts` | Background seam: deterministic studio + optional env adapters |
| `src/components/al-rahma/` | Dashboard verify modal and 2-variant ad preview |
| `functions/api/db/` | Pages Functions: `stats`, `brands`, `products`, `research`, `research/ingest` |
| `functions/api/ai/product-composite.ts` | Reference-conditioned product compositing (Gemini image edit → Workers AI FLUX.2 klein reference editing → SDXL img2img → Hugging Face) |
| `migrations/` | `0000_baseline.sql` (captured schema), `0001_product_research.sql` |
| `scripts/` | Test entrypoints run by `npm test` |
| `.opencode/skills/` | Project skills for D1/Pages, research, and ad composition |

## Hard constraints (non-negotiable)

1. **No Prisma and no SQLite.** No `prisma/`, no `DATABASE_URL`, no local
   `dev.db`. D1 is the only datastore. (`CONTRIBUTING.md` and `SECURITY.md` are
   inherited and partly stale — this file wins.)
2. **Never drop, truncate, or overwrite D1 tables or rows.** Migrations must be
   additive and idempotent (`CREATE ... IF NOT EXISTS`, `ADD COLUMN`). Never
   rewrite an already-applied migration. Never run destructive SQL against
   `makhzan-al-rahma`.
3. **Never hardcode brand names, phone numbers, or WhatsApp links outside
   `src/lib/al-rahma/brand-core.ts`.** Import `AL_RAHMA_BRAND_CONFIG`. The test
   suite enforces this with a filesystem scan.
4. **Authentic packshot conditioning — never redraw packaging.** The authentic
   product cutout **may and should** be passed to an image-to-image model as a
   reference/conditioning input for relighting, shadow/reflection generation,
   outpainting, and scene compositing. Every generation prompt must instruct the
   model to preserve the brand name, label typography, package colours and
   geometry exactly, and must forbid invented/translated labels, extra products,
   new text, prices, discounts, and watermarks. Background-only generation stays
   allowed. A composite must record `containsProduct` / `aiComposite` /
   `usedReference` provenance, keep the authentic source URL in D1, and fall back
   to a background plate plus the authentic SVG packshot when the model is
   unavailable. Never let a text-to-image model invent a package.
5. **No unverified claims.** Benefits, usage, ingredients, and medical
   assertions may appear in output only when backed by a `verified` claim whose
   source is also `verified`.
6. **No invented prices, discounts, urgency, shipping promises, or stock.**
   Missing data must render as absent, not as a placeholder.
7. **No secrets in the repo or client bundle.** Configuration comes from
   Cloudflare bindings/environment, never from committed files.

## Design system — WhatsApp Status ads

- Canvas: **1080 × 1920** vertical (`portrait`), defined in
  `AL_RAHMA_BRAND_CONFIG.visual.format`.
- Background: clean white `#FFFFFF` with a **subtle silver mesh** `#CBD5E1`
  (low opacity). No loud gradients, no dark backgrounds for product ads.
- Product: reference-conditioned composite — the authentic cutout is the
  image-to-image conditioning input, so lighting, shadows, mist and botanicals
  interact with the real package. The model must preserve the label; if no model
  is available, fall back to a background plate with the authentic packshot
  centred, generous margins, and the label fully legible. No text-to-image
  redraw, no AI-restyled package.
- Typography: strict **Arabic RTL** (`dir="rtl"`), Cairo/Tajawal from
  `brandConfig.visual.fonts`; clear hierarchy (bold 3D white brand header →
  metallic gold `#F6E27A → #D4AF37 → #8A5A10` benefit/promo headline with deep
  layered shadow → clean contact bar); no faux-Arabic glyphs, no Latin fallback
  for Arabic text.
- Overlay elements: brand chip, one badge, optional verified-only copy, footer
  contact bar. Keep safe zones clear of platform UI.

## D1 and API rules

- Every query is **parameterized** with `.bind(...)`; never interpolate user
  input into SQL.
- Validate and clamp inputs (`limit` 1–100, string length caps) before binding;
  return `400` on invalid input, `404` on missing records, generic `500` bodies.
- API responses keep the `{ success: boolean, ... }` envelope.
- New/changed schema always ships as a numbered additive migration in
  `migrations/`; apply with
  `npx wrangler d1 migrations apply makhzan-al-rahma --remote`.
- Read-only inspection only against production unless a change is explicitly
  approved.

## Verification protocol

Run **all** of these before every commit, in this order:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

- `npm test` covers the BrandConfig contract, single-source guard, copy,
  Quality Gate, overlay, and mocked D1 endpoints.
- `npm run lint` must have **0 errors**; warnings must be justified.
- `npm run build` must produce `out/` successfully.
- Never commit with failing tests, and never bypass the single-source or
  Quality Gate checks.

## Definition of done

1. Code follows the constraints above and existing patterns.
2. All four verification commands pass.
3. `git status` contains only intended changes; secrets and build output
   (`out/`, `.next/`, `.wrangler/`) are not committed.
4. Preview deployment verified against real D1 (read-only) before claiming a
   behavior works.
5. Commit message states what changed and why; push to
   `origin/fix/al-rahma-dashboard` only.
