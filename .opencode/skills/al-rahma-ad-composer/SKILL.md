---
name: Al Rahma Ad Composer
description: Use when generating WhatsApp Status ad variants for Al Rahma products — 1080x1920 white/silver-mesh layouts, authentic packshot compositing, Arabic RTL copy from BrandConfig, and Quality Gate approval.
---

# Al Rahma Ad Composer

Goal: produce **2 distinct, publishable ad variants per product** that are
brand-consistent, truthful, and visually clean — never synthetic packaging.

## Inputs (all required)

1. Product row + brand from D1 (`products`, `brands`).
2. At least one authentic reference packshot (`product_assets`,
   `image_type='reference'`, usable `image_url`).
3. `AL_RAHMA_BRAND_CONFIG` from `src/lib/al-rahma/brand-core.ts`.
4. Claims: only `verifiedBenefits` / `verifiedUsage` from
   `/api/db/research`. If both lists are empty, use identity-only copy.
5. Optional price — only if supplied by the warehouse. Never infer it.

If any input is missing, stop and report the blocker. Do not fabricate.

## Two variants, genuinely distinct

Generate exactly two per product. They must differ in **angle and layout**, not
just a color swap:

| Variant | Angle | Layout emphasis |
| --- | --- | --- |
| 1 | `product_information` or `product_features` | Packshot centered, identity-led headline, detail block |
| 2 | `beauty_routine` or `combo_deal` | Editorial composition, larger headline, routine/context block |

Rules:

- Both variants use the same verified facts; only framing differs.
- No variant may introduce a claim the other can't support.
- If only one angle is supportable (e.g., no verified usage), the second
  variant stays informational — do not invent a routine.
- Variant numbering and metadata must be recorded (`variant_number` 1 and 2).

## Visual system

- Canvas **1080 × 1920** portrait; export at exactly that size.
- Background: `#FFFFFF` base with a subtle `#CBD5E1` mesh
  (`visual.background`), low opacity. Keep it quiet behind the product.
- Safe zones: keep ≥ 96 px from edges for text; reserve the bottom ~200 px for
  the footer/contact bar; avoid the top ~120 px on WhatsApp Status.
- Palette, fonts, and badge colors come from `brandConfig.visual`; never
  hardcode hex values in new components.
- Arabic RTL only. Headline, supporting line, CTA — three clear levels.
  No Latin transliteration as the main headline.
- One badge maximum. No sticker spam, no fake "SALE" bursts.

## Packshot compositing (hard rule)

Allowed:

- background removal / masking,
- scaling, positioning, mild shadow,
- color-neutral cleanup around the cutout.

Forbidden:

- AI redrawing, regenerating, or "enhancing" the package,
- rewriting, translating, or typesetting label text,
- inventing a logo, variant, size, or extra product,
- stretching or warping the pack,
- compositing a different product's image.

If the reference image is not authentic or the label is unreadable, block the
ad. Authenticity beats volume.

## Copy rules

- Use `ArabicCopywriter.generatePost()` / `ProductionEngine.execute()` so brand
  name and phone are injected from `BrandConfig`.
- Never hardcode brand name, phone, or WhatsApp URL outside
  `brand-core.ts`.
- Include the contact CTA (phone/WhatsApp from config).
- No medical claims. No "cure/treat/guaranteed". No invented percentages.
- No price or discount unless explicitly provided; no countdown/urgency.
- Hashtags come from `brandConfig.hashtags` plus product-specific tags.

## Quality Gate (blocking)

Every variant must pass `QualityGate.evaluate()`:

- headline 2–20 words, hook present, clear CTA,
- **verified source present** (product verified + source URL),
- price consistency when a price is used,
- no banned/misleading phrases,
- 3–15 hashtags,
- visual dimensions ≥ 500 px (we use 1080×1920).

A failed gate means no output. Fix the input or copy; never relax the gate.

## Output contract

For each variant return:

- `product_id`, `variant_number` (1|2), `angle`, `style_id`,
- rendered SVG/PNG at 1080×1920,
- copy object (headline, body, CTA, hashtags),
- quality report (score, checks, warnings),
- source ids backing any claim,
- warnings/blockers.

Persist creative metadata in `creatives` only when the warehouse approves
generation; do not enable Cron or automated generation without explicit
approval.

## Review checklist

- [ ] Two variants, visibly different angles/layouts
- [ ] Authentic packshot, label untouched and legible
- [ ] 1080×1920, white + subtle silver mesh
- [ ] Arabic RTL hierarchy, config fonts only
- [ ] Phone/WhatsApp from `BrandConfig`
- [ ] Only verified claims; no prices unless supplied
- [ ] Quality Gate passed for both
- [ ] `npm test && npm run typecheck && npm run lint && npm run build` green
