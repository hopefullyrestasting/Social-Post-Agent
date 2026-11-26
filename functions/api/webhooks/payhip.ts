import { hashAccessKey, nowSeconds, tenantSettingKey } from "../_tenant";

interface Env {
  DB: D1Database;
  PAYHIP_API_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

interface PayhipPaidEvent {
  id: string;
  email: string;
  type: string;
  signature: string;
  customer_first_name?: string;
  customer_last_name?: string;
}

const DASHBOARD_URL = "https://social-post-agent.pages.dev/dashboard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function expectedSignature(apiKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendAccessEmail(
  env: Env,
  event: PayhipPaidEvent,
  accessKey: string,
): Promise<"delivered" | "failed" | "not_configured"> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!apiKey || !from) return "not_configured";

  const firstName = event.customer_first_name?.trim();
  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const text = `${greeting}\n\nYour Social Post Agent studio access key is:\n${accessKey}\n\nOpen your studio: ${DASHBOARD_URL}`;
  const html = `<p>${escapeHtml(greeting)}</p><p>Your Social Post Agent studio access key is:</p><p><strong>${accessKey}</strong></p><p><a href="${DASHBOARD_URL}">Open your studio</a></p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [event.email],
        subject: "Your Social Post Agent studio access",
        text,
        html,
      }),
    });
    return response.ok ? "delivered" : "failed";
  } catch {
    return "failed";
  }
}

function validPaidEvent(payload: Record<string, unknown>): PayhipPaidEvent | null {
  if (
    typeof payload.id !== "string" ||
    payload.id.length < 1 ||
    payload.id.length > 200 ||
    typeof payload.email !== "string" ||
    payload.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    typeof payload.type !== "string" ||
    typeof payload.signature !== "string"
  ) {
    return null;
  }
  return {
    id: payload.id,
    email: payload.email,
    type: payload.type,
    signature: payload.signature,
    ...(typeof payload.customer_first_name === "string"
      ? { customer_first_name: payload.customer_first_name.slice(0, 100) }
      : {}),
    ...(typeof payload.customer_last_name === "string"
      ? { customer_last_name: payload.customer_last_name.slice(0, 100) }
      : {}),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = env.PAYHIP_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { success: false, error: "Payhip webhook verification is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 65_536) {
    return Response.json({ success: false, error: "Webhook payload is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 65_536) {
      return Response.json({ success: false, error: "Webhook payload is too large." }, { status: 413 });
    }
    payload = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ success: false, error: "Webhook body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(payload)) {
    return Response.json({ success: false, error: "Webhook body must be a JSON object." }, { status: 400 });
  }

  const signature = (await expectedSignature(apiKey)).toLowerCase();
  if (
    typeof payload.signature !== "string" ||
    !constantTimeEqual(payload.signature.toLowerCase(), signature)
  ) {
    return Response.json({ success: false, error: "Invalid Payhip signature." }, { status: 401 });
  }
  if (typeof payload.type !== "string") {
    return Response.json({ success: false, error: "Webhook event type is required." }, { status: 400 });
  }
  if (payload.type !== "paid") {
    return Response.json({ success: true, ignored: true, event_type: payload.type });
  }
  const event = validPaidEvent(payload);
  if (!event) {
    return Response.json({ success: false, error: "Webhook event is missing required fields." }, { status: 400 });
  }

  const now = nowSeconds();
  const tenantId = crypto.randomUUID();
  const accessKey = `arh_${Array.from(
    crypto.getRandomValues(new Uint8Array(24)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
  const keyHash = await hashAccessKey(accessKey);
  const label = `${event.customer_first_name ?? ""} ${event.customer_last_name ?? ""}`.trim() || event.email;
  const expiresAt = now + 365 * 86_400;
  const statements = [
    env.DB.prepare(
      "INSERT INTO activation_keys (id,key_hash,label,status,created_at,expires_at,brand_locked,quota_total,quota_used) VALUES (?,?,?,'active',?,?,0,0,0)",
    ).bind(tenantId, keyHash, label, now, expiresAt),
    env.DB.prepare(
      "INSERT INTO business_settings (key,value,updated_at,tenant_key_id) VALUES (?,?,?,?)",
    ).bind(tenantSettingKey(tenantId, "provisioning.plan"), "annual", now * 1000, tenantId),
    env.DB.prepare(
      "INSERT INTO business_settings (key,value,updated_at,tenant_key_id) VALUES (?,?,?,?)",
    ).bind(
      tenantSettingKey(tenantId, "provisioning.client_email"),
      event.email,
      now * 1000,
      tenantId,
    ),
    env.DB.prepare(
      "INSERT INTO business_settings (key,value,updated_at,tenant_key_id) VALUES (?,?,?,?)",
    ).bind(
      tenantSettingKey(tenantId, "provisioning.brand_defaults"),
      JSON.stringify({ locale: "en", rtl: false }),
      now * 1000,
      tenantId,
    ),
    env.DB.prepare(
      `INSERT INTO payhip_webhook_events
         (event_id,event_type,tenant_key_id,delivery_status,created_at,updated_at)
       VALUES (?, 'paid', ?, 'pending', ?, ?)`,
    ).bind(event.id, tenantId, now, now),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    try {
      const existing = await env.DB.prepare(
        "SELECT tenant_key_id, delivery_status FROM payhip_webhook_events WHERE event_id = ?",
      ).bind(event.id).first<{ tenant_key_id: string; delivery_status: string }>();
      if (existing) {
        return Response.json(
          {
            success: true,
            duplicate: true,
            tenant_key_id: existing.tenant_key_id,
            delivery_status: existing.delivery_status,
          },
          { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
        );
      }
    } catch (lookupError) {
      console.error("Unable to resolve Payhip event idempotency state.", lookupError);
    }
    console.error("Unable to provision Payhip purchase.", error);
    return Response.json({ success: false, error: "Unable to provision purchase." }, { status: 500 });
  }

  const deliveryStatus = await sendAccessEmail(env, event, accessKey);
  try {
    await env.DB.prepare(
      "UPDATE payhip_webhook_events SET delivery_status = ?, updated_at = ? WHERE event_id = ?",
    ).bind(deliveryStatus, nowSeconds(), event.id).run();
  } catch (error) {
    console.error("Unable to persist Payhip email delivery status.", error);
    return Response.json(
      { success: false, error: "Purchase provisioned but delivery status could not be saved." },
      { status: 500 },
    );
  }

  return Response.json(
    { success: true, duplicate: false, tenant_key_id: tenantId, delivery_status: deliveryStatus },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
