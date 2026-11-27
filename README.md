# PostCraft by iDesign

PostCraft is a branded social content studio for brands, agencies, graphic
designers, and product sellers. It turns a product catalog and authentic
reference images into polished, ready-to-review social creatives while keeping
brand identity, verified product information, and tenant ownership separate.

- **Brands** can establish a one-time brand lock and keep a consistent identity.
- **Agencies** can manage multiple client workspaces from separate activation keys.
- **Graphic designers** can create RTL/LTR product showcases and export creative sets.
- **Product sellers** can organize a catalog and produce sequential product designs
  without reusing the same generated item.

## Studio capabilities

- Multi-tenant workspace isolation for products, assets, campaigns, creatives,
  settings, and quota usage.
- Activation-key authentication with per-key quota and status management.
- One-time brand locking: a key can be unlocked and reset by an administrator,
  after which it may be locked to a brand again without changing the activation key.
- RTL and LTR interfaces and generated text layouts, including Arabic and English.
- Verified product data, controlled claims, authentic reference images, and
  export-ready 1080 x 1920 social creative output.
- Payhip purchase-key provisioning and admin key provisioning flows, with the
  existing webhook and key-validation behavior preserved.

## Architecture

The repository uses:

- Next.js 16 App Router with static export (`output: "export"`), built to `out/`.
- TypeScript and Tailwind CSS.
- Cloudflare Pages Functions in `functions/api/`.
- Cloudflare D1 as the only application datastore.
- Tenant-scoped D1 queries and activation-key digests; raw activation keys are
  never persisted or logged.
- Cloudflare bindings and environment variables for runtime configuration.

The main routes are:

| Route | Purpose |
| --- | --- |
| `/` | Product entry point and studio launch |
| `/dashboard` | Key-authenticated multi-tenant studio |
| `/admin` | Admin key management and support controls |
| `/api/...` | Cloudflare Pages Functions for tenant, D1, webhook, asset, and AI operations |

## Local development

Requires Node.js and npm.

```sh
npm ci
npm run dev
```

The production site is a static Next.js export. Cloudflare Pages serves `out/`
and executes files under `functions/` as Pages Functions.

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run build` creates `out/`. Do not commit build output or local configuration
containing credentials.

## Cloudflare and D1

Cloudflare Pages provides the `DB` D1 binding and the required runtime bindings.
Database configuration and migrations are documented in `wrangler.toml` and
`migrations/`.

This project uses additive D1 migrations only. Do not drop, truncate, or rewrite
D1 tables or production rows. Apply migrations only after review and explicit
approval for the target environment.

Example read-only inspection:

```sh
npx wrangler login
npx wrangler d1 execute makhzan-al-rahma --remote --command "SELECT COUNT(*) FROM products"
```

## Security and tenant controls

- Admin endpoints require `ADMIN_API_KEY` through the existing `requireAdmin`
  authentication flow.
- Tenant endpoints authenticate activation keys and enforce tenant ownership.
- SQL parameters are bound rather than interpolated.
- Quotas are isolated per activation key.
- Brand lock resets clear the tenant's lock fields, lock metadata, and tenant
  brand override settings. They preserve the activation key, tenant status,
  provisioning metadata, and quota state.
- Secrets belong only in Cloudflare bindings or environment configuration.
  Never commit `.dev.vars`, API keys, access keys, or webhook secrets.

## Search and social discovery

The static export includes metadata and discovery assets for PostCraft:

- `public/robots.txt`
- `public/sitemap.xml`
- `public/site.webmanifest`
- `public/favicon.svg`

The public website identity is [idesign.social](https://idesign.social).
