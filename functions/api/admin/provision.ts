import { requireAdmin, noStore } from "./_admin";
import { hashAccessKey, nowSeconds, tenantSettingKey } from "../_tenant";
interface Env { DB: D1Database; ADMIN_API_KEY?: string; }

function generateAccessKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `arh_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("Request body must be an object.");
    body = parsed;
  } catch {
    return Response.json({ success: false, error: "Invalid JSON object." }, { status: 400 });
  }

  const copies = Array.isArray(body.copies) ? body.copies : [body];
  if (!copies.length || copies.length > 100) {
    return Response.json({ success: false, error: "Provide 1–100 copies." }, { status: 400 });
  }

  const now = nowSeconds();
  const issued: {
    id: string;
    access_key: string;
    label: string | null;
    client_email: string | null;
    plan: string;
    quota_total: number;
    locale: string;
    expires_at: number;
    copy_kind: string;
  }[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const raw of copies) {
    if (!isRecord(raw)) {
      return Response.json({ success: false, error: "Each tenant must be an object." }, { status: 400 });
    }

    const days = Number(raw.expires_in_days ?? 365);
    const quotaTotal = Number(raw.quota_total ?? 0);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return Response.json({ success: false, error: "expires_in_days must be 1–3650." }, { status: 400 });
    }
    if (!Number.isSafeInteger(quotaTotal) || quotaTotal < 0 || quotaTotal > 1_000_000_000) {
      return Response.json({ success: false, error: "quota_total must be 0–1000000000." }, { status: 400 });
    }

    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 120) || null : null;
    const clientEmail = typeof raw.client_email === "string"
      ? raw.client_email.trim().slice(0, 254) || null
      : null;
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return Response.json({ success: false, error: "client_email must be a valid email address." }, { status: 400 });
    }

    const plan = typeof raw.plan === "string" ? raw.plan.trim().slice(0, 40) : "annual";
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(plan)) {
      return Response.json({ success: false, error: "plan must be a 1–40 character identifier." }, { status: 400 });
    }

    const locale = raw.locale === "ar" ? "ar" : raw.locale === undefined || raw.locale === "en" ? "en" : null;
    if (!locale) {
      return Response.json({ success: false, error: "locale must be en or ar." }, { status: 400 });
    }

    const copyKind = ["customer", "marketing", "demo"].includes(String(raw.copy_kind))
      ? String(raw.copy_kind)
      : "customer";
    const accessKey = generateAccessKey();
    const id = crypto.randomUUID();
    const expiresAt = now + days * 86_400;
    const keyHash = await hashAccessKey(accessKey);
    const defaults = isRecord(raw.brand_defaults) ? raw.brand_defaults : {};
    const brandDefaults = {
      ...defaults,
      locale,
      rtl: locale === "ar",
    };

    statements.push(
      env.DB.prepare(
        "INSERT INTO activation_keys (id,key_hash,label,status,created_at,expires_at,brand_locked,quota_total,quota_used) VALUES (?,?,?,'active',?,?,0,?,0)",
      ).bind(id, keyHash, label, now, expiresAt, quotaTotal),
    );

    const metadata: Record<string, string | null> = {
      notes: typeof raw.notes === "string" ? raw.notes.slice(0, 2000) : null,
      copy_kind: copyKind,
      plan,
      client_email: clientEmail,
      brand_defaults: JSON.stringify(brandDefaults),
    };
    for (const [setting, value] of Object.entries(metadata)) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO business_settings (key,value,updated_at,tenant_key_id) VALUES (?,?,?,?)",
        ).bind(tenantSettingKey(id, `provisioning.${setting}`), value, Date.now(), id),
      );
    }

    issued.push({
      id,
      access_key: accessKey,
      label,
      client_email: clientEmail,
      plan,
      quota_total: quotaTotal,
      locale,
      expires_at: expiresAt,
      copy_kind: copyKind,
    });
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Failed to provision admin activation key(s).", error);
    return Response.json({ success: false, error: "Unable to provision activation key(s)." }, { status: 500 });
  }

  return Response.json({ success: true, issued }, { headers: noStore() });
};