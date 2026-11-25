# Provisioning customer, marketing and demo copies

The studio uses one annual `arh_...` access key per tenant workspace. Each key
gets its own brand lock, products, assets, campaigns and business settings.
Provisioning is an **admin-only** action: tenant keys can use the studio but can
never create other keys.

## 1. Cloudflare checklist

1. Bind D1 database `makhzan-al-rahma` to the Pages project (`DB`).
2. Make sure additive migrations through `0006_basic_studio_fields.sql` are
   applied. Apply new migrations only after review/approval:
   ```powershell
   npx wrangler d1 migrations apply makhzan-al-rahma --remote
   ```
3. Set the admin secret (never commit it, never put it in `.dev.vars` for a
   shared workspace):
   ```powershell
   npx wrangler pages secret put ADMIN_API_KEY --project-name <your-pages-project>
   ```
4. Optionally bind `PRODUCT_ASSETS` (R2). Without it, uploads are embedded in
   D1 as small data URIs; the helper keeps logos small enough for that path.
5. Deploy, then verify read-only with `GET /api/tenant/me` using a provisioned
   key before giving it to a customer.

## 2. Helper

`scripts/provision-copy.ts` calls `POST /api/tenant/provision` once per copy.
Raw keys are returned once and printed in redacted form on stdout. With `--out`,
the raw keys are written to a private JSON file (never commit that file).

```powershell
# Annual customer copy with brand defaults
$env:PROVISION_API_URL = "https://<your-pages-project>.pages.dev/api/tenant/provision"
$env:ADMIN_API_KEY = "<admin secret>"
npx tsx scripts/provision-copy.ts --count 1 --kind customer `
  --label-prefix "Customer" --brand-name "My Store" --industry "Retail" `
  --locale en --support-contact "support@example.com" `
  --out ./private/customer-keys.json

# Five 30-day marketing/demo copies
npx tsx scripts/provision-copy.ts --count 5 --kind demo --days 30 `
  --label-prefix "Demo" --notes "Campaign preview" `
  --brand-name "Demo Store" --industry "Retail" --locale ar `
  --out ./private/demo-keys.json

# Preview payloads without creating keys
npx tsx scripts/provision-copy.ts --count 2 --kind marketing --dry-run
```

### Copy kinds

| Kind | Intended use |
| --- | --- |
| `customer` | Paying tenant; annual lease by default. |
| `marketing` | Campaign/sales demos; usually short `--days`. |
| `demo` | Internal or prospect sandbox; usually short `--days`. |

`--notes` is operator metadata only. It is stored in namespaced
`business_settings` and shown to the tenant as a setup prefill notice; it is
never used in ads and never contains credentials.

### Expiry

- No `--expiry`/`--days`: annual (365 days) from provisioning.
- `--days 30`: custom 30-day lease.
- `--expiry 2027-01-31T00:00:00Z`: exact UTC expiry.
- `--expiry` and `--days` are mutually exclusive.

### Brand/locale defaults and support contact

`--brand-name`, `--industry`, `--locale`, `--rtl`, `--support-contact` and
`--logo-url` are prefilled into the one-time Brand Setup card via
`GET /api/tenant/me`. The tenant still confirms and locks the identity once;
provisioning never bypasses the one-time lock.

### Batch file

Use `--copies` for reseller-specific overrides. It can extend `--count`:

```json
[
  {
    "label": "Reseller Cairo",
    "notes": "Cairo reseller",
    "copy_kind": "customer",
    "expires_in_days": 365,
    "brand_defaults": {
      "brand_name": "Cairo Store",
      "industry": "Perfumes",
      "locale": "ar-EG",
      "rtl": true,
      "support_contact": "support@example.com"
    }
  },
  {
    "label": "Reseller Kuala Lumpur",
    "copy_kind": "marketing",
    "brand_defaults": {
      "brand_name": "KL Store",
      "industry": "Skincare",
      "locale": "ms",
      "rtl": false
    }
  }
]
```

```powershell
npx tsx scripts/provision-copy.ts --copies ./private/copies.json --out ./private/keys.json
```

## 3. Tenant handoff

1. Open `/dashboard` and paste the `arh_...` key into the Access Key bar.
2. Confirm prefilled brand name, industry, locale and support contact.
3. Optionally upload a logo from phone gallery/camera or desktop. PNG, JPEG,
   WebP and SVG are accepted; SVG is rasterised in the browser before upload.
   The stored asset URL is passed to `POST /api/tenant/lock-brand`.
4. Click **Lock Brand & Save (One-Time)**. The identity is now permanent.
5. Upload product photos and generate creatives.

## 4. Safety

- Admin key stays server-side; the helper sends it only in `X-Admin-Key`.
- Never paste raw access keys into chat, tickets, source files or screenshots.
- `--out` files contain live credentials: store them in a secret manager and
  delete local copies after handoff.
- Tenant writes are authorized by the tenant access key, not the admin key.
- No D1 table is ever dropped or truncated by provisioning; all writes are
  inserts or additive updates scoped by tenant id.
