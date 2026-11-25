/**
 * CLI: provision one or many iDesign studio instances via the admin endpoint.
 *
 * Examples:
 *   npx tsx scripts/provision-copy.ts --count 3 --kind demo --days 30 \
 *     --label-prefix "Demo" --brand-name "Demo Store" --industry "Retail" \
 *     --locale en --out ./private/demo-keys.json
 *
 *   npx tsx scripts/provision-copy.ts --copies ./private/copies.json --out ./private/keys.json
 *
 * Never commit the output file. It contains raw `arh_...` keys.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  buildProvisionPayload,
  buildProvisionPlans,
  COPY_KINDS,
  isCopyKind,
  provisionCopies,
  redactAccessKey,
  type CopyKind,
  type CopyOverride,
  type ProvisionBrandDefaults,
} from "../src/lib/al-rahma/provisioning";

type CliOptions = {
  apiUrl: string;
  adminKey: string;
  count: number;
  labelPrefix: string;
  notes?: string;
  kind: CopyKind;
  expiry?: string;
  days?: number;
  quota?: number;
  adoptLegacy: boolean;
  brandDefaults: ProvisionBrandDefaults;
  copiesFile?: string;
  outFile?: string;
  dryRun: boolean;
};

const HELP = `Usage: npx tsx scripts/provision-copy.ts [options]

Single or batch tenant-copy provisioning (admin-only).

Options:
  --api URL             Provision endpoint (default PROVISION_API_URL or http://localhost:8788/api/tenant/provision)
  --count N             Number of copies (default 1, max 1000)
  --copies FILE         JSON array of per-copy overrides; extends --count
  --label-prefix TEXT   Label prefix for batch copies (default "Copy")
  --kind KIND           customer | marketing | demo (default customer)
  --notes TEXT          Internal operator note
  --expiry ISO          Custom expiry date; mutually exclusive with --days
  --days N              Expiry in N days (default: annual on the server)
  --quota N             Optional generation quota; 0 = unlimited
  --adopt-legacy        Claim unassigned legacy D1 rows for the first copy
  --brand-name TEXT     Prefill brand name in the tenant setup card
  --industry TEXT       Prefill industry in the tenant setup card
  --locale CODE         Prefill locale (ar, en, ms, fr, de, zh or ar-EG)
  --rtl BOOL            true | false (default follows locale)
  --support-contact TEXT Prefill tenant contact info
  --logo-url URL        Optional prefilled logo URL
  --out FILE            Write the one-time key bundle here (never commit it)
  --dry-run             Print payloads without provisioning keys
  --help                Show this help

ADMIN_API_KEY must be exported in the environment for real provisioning.
`;

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
  return value;
}

function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error("Boolean flags accept true/false only.");
}

function readCopies(file: string): CopyOverride[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("--copies must contain a JSON array.");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Copy ${index + 1} must be an object.`);
    }
    const raw = entry as Record<string, unknown>;
    const source = (raw.brand_defaults && typeof raw.brand_defaults === "object"
      ? raw.brand_defaults
      : raw.brandDefaults ?? {}) as Record<string, unknown>;
    const brandDefaults: ProvisionBrandDefaults = {
      ...(typeof source.brand_name === "string" ? { brand_name: source.brand_name } : {}),
      ...(typeof source.industry === "string" ? { industry: source.industry } : {}),
      ...(typeof source.locale === "string" ? { locale: source.locale } : {}),
      ...(typeof source.rtl === "boolean" ? { rtl: source.rtl } : {}),
      ...(typeof source.support_contact === "string"
        ? { support_contact: source.support_contact }
        : {}),
      ...(typeof source.logo_url === "string" ? { logo_url: source.logo_url } : {}),
    };
    const kind = String(raw.copy_kind ?? raw.copyKind ?? "customer");
    return {
      ...(typeof raw.label === "string" ? { label: raw.label } : {}),
      ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
      ...(isCopyKind(kind) ? { copyKind: kind as CopyKind } : {}),
      ...(typeof raw.expires_at === "string" ? { expiresAt: raw.expires_at } : {}),
      ...(typeof raw.expires_in_days === "number" ? { expiresInDays: raw.expires_in_days } : {}),
      ...(typeof raw.quota_total === "number" ? { quotaTotal: raw.quota_total } : {}),
      ...(raw.adoptLegacyData === true ? { adoptLegacyData: true } : {}),
      brandDefaults,
    };
  });
}

export function parseCli(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const options: CliOptions = {
    apiUrl:
      env.PROVISION_API_URL || "http://localhost:8788/api/tenant/provision",
    adminKey: (env.ADMIN_API_KEY ?? "").trim(),
    count: 1,
    labelPrefix: "Copy",
    kind: "customer",
    adoptLegacy: false,
    brandDefaults: {},
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--help":
      case "-h":
        console.log(HELP);
        process.exit(0);
        break;
      case "--api":
        options.apiUrl = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--count":
        options.count = Number(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--copies":
        options.copiesFile = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--label-prefix":
        options.labelPrefix = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--kind": {
        const value = valueAfter(argv, index, flag);
        if (!isCopyKind(value)) throw new Error(`Unknown copy kind: ${value}`);
        options.kind = value;
        index += 1;
        break;
      }
      case "--notes":
        options.notes = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--expiry":
        options.expiry = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--days":
        options.days = Number(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--quota":
        options.quota = Number(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--adopt-legacy":
        options.adoptLegacy = true;
        break;
      case "--brand-name":
        options.brandDefaults.brand_name = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--industry":
        options.brandDefaults.industry = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--locale":
        options.brandDefaults.locale = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--rtl":
        options.brandDefaults.rtl = parseBoolean(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--support-contact":
        options.brandDefaults.support_contact = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--logo-url":
        options.brandDefaults.logo_url = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--out":
        options.outFile = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}. Use --help.`);
    }
  }

  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 1000) {
    throw new Error("--count must be an integer between 1 and 1000.");
  }
  if (options.expiry && options.days !== undefined) {
    throw new Error("Use --expiry or --days, not both.");
  }
  if (options.days !== undefined && (!Number.isInteger(options.days) || options.days < 1)) {
    throw new Error("--days must be a positive integer.");
  }
  if (options.quota !== undefined && (!Number.isInteger(options.quota) || options.quota < 0)) {
    throw new Error("--quota must be zero or a positive integer.");
  }
  if (options.adoptLegacy && options.count > 1) {
    throw new Error("--adopt-legacy is only valid for a single copy.");
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const copies: CopyOverride[] = options.copiesFile ? readCopies(options.copiesFile) : [];
  const plans = buildProvisionPlans({
    count: options.count,
    labelPrefix: options.labelPrefix,
    notes: options.notes,
    copyKind: options.kind,
    expiresAt: options.expiry,
    expiresInDays: options.days,
    quotaTotal: options.quota,
    adoptLegacyData: options.adoptLegacy,
    brandDefaults: options.brandDefaults,
    copies,
  });

  if (options.dryRun) {
    console.log(JSON.stringify(plans.map((plan) => ({
      index: plan.index,
      label: plan.label,
      payload: buildProvisionPayload(plan),
    })), null, 2));
    return;
  }

  if (!options.adminKey) {
    throw new Error("ADMIN_API_KEY is not set. Export it before provisioning.");
  }

  const results = await provisionCopies({
    apiUrl: options.apiUrl,
    adminKey: options.adminKey,
    plans,
  });

  for (const result of results) {
    console.log(
      `${result.index}/${plans.length} ${result.label}: ${redactAccessKey(result.accessKey)}`,
    );
  }

  if (options.outFile) {
    writeFileSync(
      options.outFile,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          api_url: new URL(options.apiUrl).origin,
          copies: results.map((result) => ({
            ...result,
            expires_at_iso: result.expiresAt
              ? new Date(result.expiresAt * 1000).toISOString()
              : null,
          })),
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    console.error(`Raw keys written to ${options.outFile}. Store it outside the repo; never commit it.`);
  } else {
    console.error("Raw keys are only shown above. Use --out to save a private key bundle.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
