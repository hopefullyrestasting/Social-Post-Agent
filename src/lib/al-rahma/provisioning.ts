/**
 * Repeatable tenant-copy provisioning helpers.
 *
 * The admin key is only ever sent in the X-Admin-Key header to the admin-only
 * provisioning endpoint. It is never written into payloads, output files, or
 * logs. Access keys are returned by the endpoint exactly once.
 */

export const COPY_KINDS = ["customer", "marketing", "demo"] as const;
export type CopyKind = (typeof COPY_KINDS)[number];

export interface ProvisionBrandDefaults {
  brand_name?: string;
  industry?: string;
  locale?: string;
  rtl?: boolean;
  support_contact?: string;
  logo_url?: string;
}

export interface ProvisionCopyBase {
  notes?: string;
  copyKind?: CopyKind;
  copy_kind?: CopyKind;
  expiresAt?: string;
  expires_at?: string;
  expiresInDays?: number;
  expires_in_days?: number;
  quotaTotal?: number;
  adoptLegacyData?: boolean;
  brandDefaults?: ProvisionBrandDefaults;
}

export interface CopyOverride extends ProvisionCopyBase {
  label?: string;
}

export interface ProvisionPlan extends Omit<ProvisionCopyBase, "copyKind" | "copy_kind"> {
  label: string;
  index: number;
  total: number;
  copyKind: CopyKind;
}

export interface ProvisionPlanInput extends ProvisionCopyBase {
  count?: number;
  labelPrefix?: string;
  copies?: CopyOverride[];
}

export interface ProvisionResult {
  index: number;
  label: string;
  accessKey: string;
  expiresAt: number | null;
  copyKind: CopyKind;
  tenantId?: string;
}

function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  ) as Partial<T>;
}

export function isCopyKind(value: string): value is CopyKind {
  return (COPY_KINDS as readonly string[]).includes(value);
}

/** Masks a raw key for operator logs; never returns the full key. */
export function redactAccessKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}••••`;
  return `${trimmed.slice(0, 8)}••••${trimmed.slice(-4)}`;
}

export function buildProvisionPlans(input: ProvisionPlanInput): ProvisionPlan[] {
  const copies = input.copies ?? [];
  const requested = Math.max(1, Math.min(1000, Math.floor(input.count ?? 1)));
  const total = Math.max(requested, copies.length);
  const prefix = (input.labelPrefix || "Copy").trim() || "Copy";

  return Array.from({ length: total }, (_, offset) => {
    const override = copies[offset] ?? {};
    const number = offset + 1;
    const suffix = total > 1 || copies.length > 0 ? ` ${String(number).padStart(2, "0")}` : "";
    const kind = override.copyKind ?? override.copy_kind ?? input.copyKind ?? input.copy_kind ?? "customer";
    const notes = [input.notes, override.notes, total > 1 ? `instance ${number}/${total}` : ""]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" · ");

    return {
      index: number,
      total,
      label: (override.label || `${prefix}${suffix}`).trim().slice(0, 120),
      notes: notes || undefined,
      copyKind: isCopyKind(kind) ? kind : "customer",
      expiresAt: override.expiresAt ?? override.expires_at ?? input.expiresAt ?? input.expires_at,
      expiresInDays:
        override.expiresInDays ??
        override.expires_in_days ??
        input.expiresInDays ??
        input.expires_in_days,
      quotaTotal: override.quotaTotal ?? input.quotaTotal,
      adoptLegacyData: override.adoptLegacyData ?? input.adoptLegacyData,
      brandDefaults: compactRecord({
        ...(input.brandDefaults ?? {}),
        ...(override.brandDefaults ?? {}),
      }) as ProvisionBrandDefaults,
    };
  });
}

export function buildProvisionPayload(plan: ProvisionPlan): Record<string, unknown> {
  if (plan.expiresAt && plan.expiresInDays !== undefined) {
    throw new Error(`Copy ${plan.index}: use --expiry or --days, not both.`);
  }
  const brandDefaults = compactRecord(
    (plan.brandDefaults ?? {}) as Record<string, unknown>,
  );
  return {
    label: plan.label,
    notes: plan.notes || undefined,
    copy_kind: plan.copyKind ?? "customer",
    ...(plan.expiresAt ? { expires_at: plan.expiresAt } : {}),
    ...(plan.expiresInDays !== undefined ? { expires_in_days: plan.expiresInDays } : {}),
    ...(plan.quotaTotal !== undefined ? { quota_total: plan.quotaTotal } : {}),
    ...(plan.adoptLegacyData ? { adoptLegacyData: true } : {}),
    ...(Object.keys(brandDefaults).length > 0 ? { brand_defaults: brandDefaults } : {}),
  };
}

export interface ProvisionFetchDeps {
  fetch: typeof fetch;
}

/** Calls the admin-only endpoint once per plan. Raw keys stay in the result. */
export async function provisionCopies(
  options: {
    apiUrl: string;
    adminKey: string;
    plans: ProvisionPlan[];
  },
  deps: ProvisionFetchDeps = { fetch: globalThis.fetch },
): Promise<ProvisionResult[]> {
  const endpoint = new URL(options.apiUrl);
  if (!/^https?:$/.test(endpoint.protocol)) {
    throw new Error("Provisioning API URL must use http or https.");
  }
  if (!options.adminKey.trim()) {
    throw new Error("ADMIN_API_KEY is required for provisioning.");
  }

  const results: ProvisionResult[] = [];
  for (const plan of options.plans) {
    const response = await deps.fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Admin-Key": options.adminKey,
      },
      body: JSON.stringify(buildProvisionPayload(plan)),
    });
    const body = (await response.json()) as {
      success?: boolean;
      error?: string;
      access_key?: string;
      expires_at?: number;
      tenant?: { id?: string };
    };
    if (!response.ok || body.success === false || typeof body.access_key !== "string") {
      throw new Error(
        `Copy ${plan.index} (${plan.label}) failed (${response.status}): ${body.error || "no access key returned"}`,
      );
    }
    results.push({
      index: plan.index,
      label: plan.label,
      accessKey: body.access_key,
      expiresAt: typeof body.expires_at === "number" ? body.expires_at : null,
      copyKind: plan.copyKind,
      ...(body.tenant?.id ? { tenantId: body.tenant.id } : {}),
    });
  }
  return results;
}
