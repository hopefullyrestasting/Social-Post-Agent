import { z } from "zod";

/**
 * GET /api/db/settings
 * POST /api/db/settings (protected by admin middleware)
 *
 * Persists small business settings in D1 (business_settings key/value table).
 * Currently supports brand_logo_url (https URL or base64 PNG data URI, <= 500KB).
 */

interface Env {
  DB: D1Database;
}

const MAX_LOGO_LENGTH = 500 * 1024; // ~500KB for data URI/string

const postSchema = z
  .object({
    brand_logo_url: z
      .union([
        z.string().trim().max(MAX_LOGO_LENGTH),
        z.null(),
      ])
      .optional(),
  })
  .strict();

function isAllowedLogoValue(value: string): boolean {
  if (value.length === 0) return true;
  if (/^https?:\/\//i.test(value)) return value.length <= 2048;
  if (/^data:image\/png;base64,/i.test(value)) return value.length <= MAX_LOGO_LENGTH;
  return false;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const rows = await env.DB.prepare(
      "SELECT key, value, updated_at FROM business_settings WHERE key IN (?, ?)",
    )
      .bind("brand_logo_url", "brand_logo_data_uri")
      .all<{ key: string; value: string | null; updated_at: number | null }>();

    const settings: Record<string, string | null> = {
      brand_logo_url: null,
    };
    for (const row of rows.results) {
      if (row.key === "brand_logo_url") settings.brand_logo_url = row.value;
      // legacy/alternate key support
      if (row.key === "brand_logo_data_uri" && !settings.brand_logo_url) {
        settings.brand_logo_url = row.value;
      }
    }

    return Response.json({ success: true, settings });
  } catch (error) {
    console.error("Failed to load business settings from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load settings from D1." },
      { status: 500 },
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { success: false, error: "Invalid settings payload." },
      { status: 400 },
    );
  }

  const raw = parsed.data.brand_logo_url;
  if (raw === undefined) {
    return Response.json(
      { success: false, error: "No supported settings were provided." },
      { status: 400 },
    );
  }

  const value = raw === null ? "" : raw.trim();
  if (value && !isAllowedLogoValue(value)) {
    return Response.json(
      {
        success: false,
        error:
          "brand_logo_url must be an https URL or a PNG data URI (data:image/png;base64,...) up to 500KB.",
      },
      { status: 400 },
    );
  }

  try {
    await env.DB.prepare(
      `INSERT INTO business_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind("brand_logo_url", value || null, Date.now())
      .run();

    return Response.json({
      success: true,
      settings: { brand_logo_url: value || null },
    });
  } catch (error) {
    console.error("Failed to save business settings to D1.", error);
    return Response.json(
      { success: false, error: "Unable to save settings to D1." },
      { status: 500 },
    );
  }
};
