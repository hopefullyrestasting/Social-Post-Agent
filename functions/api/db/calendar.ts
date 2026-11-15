import { z } from "zod";
import {
  cairoToday,
  daysBetween,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_LEAD_DAYS,
  isIsoDate,
  MAX_LEAD_DAYS,
  nextOccurrenceInWindow,
} from "../_dates";

/**
 * GET  /api/db/calendar  → occasions whose 48h lead window contains today
 *                          (Africa/Cairo), with the next annual occurrence.
 * POST /api/db/calendar  → add an occasion or toggle one active/inactive.
 *
 * Adds are idempotent: the `UNIQUE (country_code, occasion_name_arabic,
 * occasion_date)` constraint + `INSERT OR IGNORE` means re-posting the same
 * occasion returns the existing row instead of duplicating it.
 */

interface Env {
  DB: D1Database;
}

interface CalendarRow {
  id: string;
  country_code: string;
  occasion_name_arabic: string;
  greeting_text_arabic: string;
  occasion_date: string;
  lead_days: number;
  accent_theme: string | null;
  is_active: number;
}

const OCCASION_GREETING_PREFIX = "كل عام وأنتم بخير بمناسبة";

const isoDate = z
  .string()
  .trim()
  .max(10)
  .refine((value) => isIsoDate(value), {
    message: "Expected a real calendar date in YYYY-MM-DD form.",
  });

const createSchema = z
  .object({
    action: z.literal("create"),
    country_code: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "country_code must be two letters.")
      .optional(),
    occasion_name_arabic: z.string().trim().min(2).max(120),
    greeting_text_arabic: z.string().trim().min(2).max(240),
    occasion_date: isoDate,
    lead_days: z.number().int().min(0).max(MAX_LEAD_DAYS).optional(),
    accent_theme: z.string().trim().max(40).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const toggleSchema = z
  .object({
    action: z.literal("toggle"),
    id: z.string().trim().min(1).max(100),
    is_active: z.boolean(),
  })
  .strict();

const payloadSchema = z.discriminatedUnion("action", [
  createSchema,
  toggleSchema,
]);

function normalizeGreeting(rawGreeting: string): string {
  const greeting = rawGreeting.trim();
  if (greeting.startsWith("كل عام")) return greeting;
  return `${OCCASION_GREETING_PREFIX} ${greeting}`;
}

function serialize(row: CalendarRow, today: string) {
  const occurrence = nextOccurrenceInWindow(
    row.occasion_date,
    today,
    row.lead_days,
  );

  return {
    ...row,
    next_occurrence: occurrence,
    days_until: occurrence ? Math.max(0, daysBetween(today, occurrence)) : null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const country = (
    url.searchParams.get("country") ?? DEFAULT_COUNTRY_CODE
  )
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(country)) {
    return Response.json(
      { success: false, error: "country must be a two-letter code." },
      { status: 400 },
    );
  }

  const today = cairoToday();

  try {
    const rows = await env.DB.prepare(
      `SELECT id, country_code, occasion_name_arabic, greeting_text_arabic,
              occasion_date, lead_days, accent_theme, is_active
       FROM cultural_calendar
       WHERE country_code = ? AND is_active = 1
       ORDER BY occasion_date
       LIMIT 60`,
    )
      .bind(country)
      .all<CalendarRow>();

    const occasions = rows.results
      .map((row) => serialize(row, today))
      .filter((row) => row.next_occurrence !== null)
      .sort(
        (left, right) =>
          (left.days_until ?? 99) - (right.days_until ?? 99) ||
          left.occasion_name_arabic.localeCompare(
            right.occasion_name_arabic,
            "ar",
          ),
      );

    return Response.json({
      success: true,
      today,
      country_code: country,
      default_lead_days: DEFAULT_LEAD_DAYS,
      occasions,
    });
  } catch (error) {
    console.error("Failed to load the cultural calendar from D1.", error);
    return Response.json(
      { success: false, error: "Unable to load the cultural calendar." },
      { status: 500 },
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: "Invalid calendar payload.",
        detail: parsed.error.issues
          .map(
            (issue) =>
              `${issue.path.join(".") || "payload"}: ${issue.message}`,
          )
          .join("; "),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const today = cairoToday();

  try {
    if (data.action === "toggle") {
      const row = await env.DB.prepare(
        `SELECT id, country_code, occasion_name_arabic, greeting_text_arabic,
                occasion_date, lead_days, accent_theme, is_active
         FROM cultural_calendar
         WHERE id = ?`,
      )
        .bind(data.id)
        .first<CalendarRow>();

      if (!row) {
        return Response.json(
          { success: false, error: "Occasion not found." },
          { status: 404 },
        );
      }

      await env.DB.prepare(
        "UPDATE cultural_calendar SET is_active = ? WHERE id = ?",
      )
        .bind(data.is_active ? 1 : 0, data.id)
        .run();

      return Response.json({
        success: true,
        occasion: serialize(
          { ...row, is_active: data.is_active ? 1 : 0 },
          today,
        ),
      });
    }

    const country = (data.country_code ?? DEFAULT_COUNTRY_CODE).toUpperCase();
    const greeting = normalizeGreeting(data.greeting_text_arabic);
    if (greeting.length > 240) {
      return Response.json(
        { success: false, error: "greeting_text_arabic is too long." },
        { status: 400 },
      );
    }

    const id = `cc-${country.toLowerCase()}-${crypto.randomUUID()}`;
    const leadDays = data.lead_days ?? DEFAULT_LEAD_DAYS;
    const isActive = data.is_active === false ? 0 : 1;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO cultural_calendar
         (id, country_code, occasion_name_arabic, greeting_text_arabic,
          occasion_date, lead_days, accent_theme, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        country,
        data.occasion_name_arabic,
        greeting,
        data.occasion_date,
        leadDays,
        data.accent_theme ?? null,
        isActive,
      )
      .run();

    const row = await env.DB.prepare(
      `SELECT id, country_code, occasion_name_arabic, greeting_text_arabic,
              occasion_date, lead_days, accent_theme, is_active
       FROM cultural_calendar
       WHERE country_code = ? AND occasion_name_arabic = ?
         AND occasion_date = ?`,
    )
      .bind(country, data.occasion_name_arabic, data.occasion_date)
      .first<CalendarRow>();

    return Response.json({
      success: true,
      created: row?.id === id,
      occasion: row ? serialize(row, today) : null,
    });
  } catch (error) {
    console.error("Failed to save the cultural calendar in D1.", error);
    return Response.json(
      { success: false, error: "Unable to save the cultural calendar." },
      { status: 500 },
    );
  }
};
