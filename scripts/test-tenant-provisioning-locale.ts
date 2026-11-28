import assert from "node:assert/strict";
import { onRequestPost as adminProvision } from "../functions/api/admin/provision";
import { onRequestPost as payhipWebhook } from "../functions/api/webhooks/payhip";
import { onRequestGet as localeEndpoint } from "../functions/api/locale";
import { hashAccessKey } from "../functions/api/_tenant";
import {
  detectLanguage,
  languageDirection,
} from "../src/lib/al-rahma/i18n";

type BoundStatement = { sql: string; values: unknown[] };
type FakeEvent = {
  tenant_key_id: string;
  delivery_status: string;
};

class FakeStatement {
  readonly values: unknown[] = [];

  constructor(
    private readonly database: FakeDatabase,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeStatement {
    this.values.splice(0, this.values.length, ...values);
    return this;
  }

  async run(): Promise<{ success: true }> {
    this.database.apply({ sql: this.sql, values: this.values });
    return { success: true };
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM payhip_webhook_events WHERE event_id")) {
      return (this.database.events.get(String(this.values[0])) as T | undefined) ?? null;
    }
    return null;
  }
}

class FakeDatabase {
  readonly activations: { id: string; key_hash: string; label: string | null; quota_total: number }[] = [];
  readonly settings = new Map<string, string | null>();
  readonly events = new Map<string, FakeEvent>();

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<unknown[]> {
    const bound = statements as unknown as FakeStatement[];
    const eventInsert = bound.find((statement) =>
      statement.sql.includes("INSERT INTO payhip_webhook_events"),
    );
    if (eventInsert && this.events.has(String(eventInsert.values[0]))) {
      throw new Error("duplicate event");
    }
    for (const statement of bound) {
      this.apply({ sql: statement.sql, values: statement.values });
    }
    return [];
  }

  apply(statement: BoundStatement): void {
    const { sql, values } = statement;
    if (sql.includes("INSERT INTO activation_keys")) {
      this.activations.push({
        id: String(values[0]),
        key_hash: String(values[1]),
        label: values[2] === null ? null : String(values[2]),
        quota_total: Number(values[5]),
      });
    } else if (sql.includes("INSERT INTO business_settings")) {
      this.settings.set(String(values[0]), values[1] === null ? null : String(values[1]));
    } else if (sql.includes("INSERT INTO payhip_webhook_events")) {
      this.events.set(String(values[0]), {
        tenant_key_id: String(values[1]),
        delivery_status: "pending",
      });
    } else if (sql.includes("UPDATE payhip_webhook_events")) {
      const event = this.events.get(String(values[2]));
      if (event) event.delivery_status = String(values[0]);
    }
  }
}

function pagesContext<Handler extends (...args: never[]) => unknown>(
  handler: Handler,
  request: Request,
  env: unknown,
): Parameters<Handler>[0] {
  return {
    request,
    env,
    params: {},
    data: {},
    functionPath: "",
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next: async () => new Response(),
  } as Parameters<Handler>[0];
}

async function signatureFor(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function run() {
  const adminDatabase = new FakeDatabase();
  const adminRequest = new Request("https://example.test/api/admin/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": "admin-test-key" },
    body: JSON.stringify({
      label: "Example Client",
      client_email: "buyer@example.test",
      plan: "annual",
      expires_in_days: 180,
      quota_total: 250,
      locale: "en",
    }),
  });
  const adminResponse = await adminProvision(
    pagesContext(adminProvision, adminRequest, {
      DB: adminDatabase as unknown as D1Database,
      ADMIN_API_KEY: "admin-test-key",
    }),
  );
  const adminResult = (await adminResponse.json()) as {
    success: boolean;
    issued: { id: string; access_key: string; plan: string; quota_total: number; locale: string }[];
  };
  assert.equal(adminResponse.status, 200);
  assert.equal(adminResult.success, true);
  assert.equal(adminResult.issued.length, 1);
  assert.match(adminResult.issued[0]!.access_key, /^arh_[a-f0-9]{48}$/);
  assert.equal(adminDatabase.activations.length, 1);
  assert.equal(
    adminDatabase.activations[0]!.key_hash,
    await hashAccessKey(adminResult.issued[0]!.access_key),
  );
  assert.equal(adminDatabase.activations[0]!.quota_total, 250);
  assert.equal(adminResult.issued[0]!.plan, "annual");
  assert.equal(adminResult.issued[0]!.locale, "en");
  assert.equal(
    JSON.parse(adminDatabase.settings.get(`${adminResult.issued[0]!.id}:provisioning.brand_defaults`) ?? "{}").rtl,
    false,
  );

  const payhipApiKey = "payhip-test-key";
  const signedEvent = {
    id: "order-123",
    email: "customer@example.test",
    type: "paid",
    signature: await signatureFor(payhipApiKey),
  };
  const webhookDatabase = new FakeDatabase();
  const webhookEnv = { DB: webhookDatabase as unknown as D1Database, PAYHIP_API_KEY: payhipApiKey };
  const makeWebhookRequest = () =>
    new Request("https://example.test/api/webhooks/payhip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedEvent),
    });
  const firstWebhook = await payhipWebhook(
    pagesContext(payhipWebhook, makeWebhookRequest(), webhookEnv),
  );
  const firstResult = (await firstWebhook.json()) as {
    success: boolean;
    duplicate: boolean;
    tenant_key_id: string;
    delivery_status: string;
  };
  assert.equal(firstWebhook.status, 200);
  assert.equal(firstResult.success, true);
  assert.equal(firstResult.duplicate, false);
  assert.equal(firstResult.delivery_status, "not_configured");
  assert.equal(webhookDatabase.activations.length, 1);
  assert.equal(webhookDatabase.events.size, 1);

  const duplicateWebhook = await payhipWebhook(
    pagesContext(payhipWebhook, makeWebhookRequest(), webhookEnv),
  );
  const duplicateResult = (await duplicateWebhook.json()) as {
    duplicate: boolean;
    tenant_key_id: string;
  };
  assert.equal(duplicateResult.duplicate, true);
  assert.equal(duplicateResult.tenant_key_id, firstResult.tenant_key_id);
  assert.equal(webhookDatabase.activations.length, 1);

  const invalidSignature = await payhipWebhook(
    pagesContext(
      payhipWebhook,
      new Request("https://example.test/api/webhooks/payhip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signedEvent, signature: "invalid" }),
      }),
      webhookEnv,
    ),
  );
  assert.equal(invalidSignature.status, 401);

  assert.equal(detectLanguage({ savedLanguage: "en", country: "EG", acceptLanguage: "ar-EG" }), "en");
  assert.equal(detectLanguage({ country: "SA", acceptLanguage: "en-US" }), "ar");
  assert.equal(detectLanguage({ country: "US", acceptLanguage: "fr-CA, en;q=0.8" }), "fr");
  assert.equal(detectLanguage({ country: "US", acceptLanguage: "es-MX" }), "en");
  assert.equal(languageDirection("en"), "ltr");

  const geoRequest = new Request("https://example.test/api/locale", {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  }) as Request & { cf?: { country?: string } };
  Object.defineProperty(geoRequest, "cf", { value: { country: "EG" } });
  const localeResponse = await localeEndpoint(
    pagesContext(localeEndpoint, geoRequest, {}),
  );
  assert.deepEqual(await localeResponse.json(), { success: true, language: "ar" });

  console.log("Tenant key, Payhip idempotency, and locale fallback tests passed.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
