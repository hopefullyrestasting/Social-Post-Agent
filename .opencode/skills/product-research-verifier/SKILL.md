---
name: Product Research Verifier
description: Use when researching Al Rahma products for the seven Egyptian-market brands, validating authentic packaging images and sources, recording evidence in D1, separating market existence from warehouse stock, or deciding whether a claim may be used in ads.
---

# Product Research Verifier

Goal: every product fact used in an ad must be traceable to a verified source,
and every product image must be the authentic package.

## Brand scope (7 brands)

| Brand | Expected `brands.slug` |
| --- | --- |
| VATIKA | `vatika` |
| FARIDA | `farida` |
| MINK | `mink` |
| PENDULINE | `penduline` |
| ASSAF | `assaf` |
| MUKHMARIA | `mukhmaria` |
| ALOE EVA | `aloe-eva` |

Do not invent brands, products, variants, sizes, or ingredients. If a product
does not exist in `products`, it is a data task, not an ad task.

## Four separate truths — never collapse them

| Field | Meaning | Where it lives |
| --- | --- | --- |
| Product identity | Name, brand, size, variant | `products` |
| Market existence | Product is sold in the Egyptian market | `products.egypt_market_status` |
| Warehouse stock | We physically have it | `products.warehouse_stock_status` + `warehouse_stock_checks` |
| Claim verification | A specific statement is backed by a specific source | `product_research_claims` |

"Available in Egypt" does **not** mean "in our warehouse". A verified source
does **not** verify a different claim. A product photo does not verify a
benefit.

## Evidence model

- `product_information_sources`: `id`, `product_id`, `source_url`,
  `source_name`, `source_type` (`manufacturer|regulator|retailer|other`),
  `verification_status` (`unverified|verified|rejected`), `retrieved_at`,
  `notes`.
- `product_research_claims`: `id`, `product_id`, `source_id`,
  `claim_type` (`benefit|usage`), `claim_text`, `verification_status`,
  `verified_at`, `notes`.
- `warehouse_stock_checks`: append-only log of physical checks
  (`stock_status`, `checked_at`, `checked_by`, `notes`).

Record first, verify second. Ingested material starts as `unverified`.

## Source hierarchy

1. **Manufacturer** — official brand site, official regional distributor.
2. **Regulator** — Egyptian Drug Authority (EDA) registrations, official
   notices.
3. **Authorized retailer** — known Egyptian pharmacy/beauty chains.
4. **Other** — marketplaces, blogs, social posts (evidence of existence only;
   never sufficient for a benefit or usage claim).

Rules:

- Prefer Arabic + English official pages; capture the exact URL and retrieval
  date.
- One source per claim row; do not batch unrelated claims under one URL.
- Reject pages that are clearly AI-generated, keyword farms, or content
  scraped from another retailer without provenance.
- Do not copy marketing claims from a reseller listing as if they were the
  manufacturer's.

## Authentic packaging checklist

Before marking an image as a reference asset:

- Label matches the product name, brand spelling, size, and variant in D1.
- Official brand logo and typography are intact — no redrawn or "cleaned up"
  labels.
- No seller watermark, price sticker, collage, or heavy filter.
- Front-facing packshot with readable label; additional angles are a bonus.
- URL is stable and attributable (manufacturer or authorized retailer).
- Store in `product_assets` with `image_type='reference'`, `source_url`,
  `verification_status`, `is_primary` (exactly one primary), `retrieved_at`.

Never generate, upscale-with-hallucination, or inpaint packaging text. If the
only image is low quality, block the ad instead.

## Medical / cosmetic claims policy

Blocked unless explicitly verified by a manufacturer or regulator source:

- treatment, cure, prevention, or diagnosis of any condition;
- "100% safe", "no side effects", "guaranteed results";
- before/after efficacy promises;
- ingredient percentages or concentrations not printed on the pack;
- dermatologist/pharmacist endorsement not published by the brand.

`QualityGate` enforces a source gate: ads fail without
`verification_status === "verified"` **and** a non-empty `sourceUrl`.

## Workflow

1. Load the product and its brand from D1 (read-only).
2. Search official brand domains first; record candidate URLs.
3. Insert sources as `unverified` with `retrieved_at`.
4. Extract claim text verbatim; store one claim per row.
5. Verify source and claim; set both to `verified` (or `rejected` with notes).
6. Confirm packaging assets and exactly one primary image.
7. Only then hand off to the ad composer, exposing **verified** claims only.

## Output contract

Return, per product:

- identity (name, brand, size, variant) and D1 `product_id`;
- market status vs warehouse status, clearly separated;
- sources used, with type and verification status;
- verified benefits / verified usage / unverified claims (three separate lists);
- reference image URLs + primary flag;
- blockers preventing ad production.

Never present unverified material as documentation, and never claim stock
without a `warehouse_stock_checks` entry.
