/**
 * POST /api/assets/vision-match
 *
 * Reads the packaging in an uploaded photo with Vision AI and returns the best
 * matching D1 product id, so the operator never has to rename files.
 *
 * Input (either shape):
 *   - multipart/form-data: `imageFile` (plus optional `fileName`)
 *   - application/json:    `{ imageDataUrl, fileName }`
 *
 * Output is always advisory: the dashboard shows the match in a review table
 * where the operator can change it before calling `/api/assets/commit-match`.
 */

import {
  base64FromBytes,
  normalizeImageMime,
  parseImageDataUrl,
  MAX_IMAGE_BYTES,
} from "./_image";
import { noStore } from "./_store";
import { resolveTenantScope } from "../_tenant";
import {
  predictProductFromImage,
  type VisionCatalogProduct,
  type VisionEnv,
} from "./_vision";

interface VisionMatchEnv extends VisionEnv {
  DB: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

interface ImageInput {
  bytes: Uint8Array;
  mime: string;
  base64: string;
  dataUrl: string;
  fileName: string;
}

type ImageInputResult =
  | { ok: true; image: ImageInput }
  | { ok: false; status: number; error: string };

const CATALOG_LIMIT = 600;
const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

function mimeFromFileName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return normalizeImageMime(MIME_BY_EXTENSION[extension] ?? null);
}

function fileFromForm(form: FormData): File | null {
  const candidate =
    form.get("imageFile") ?? form.get("file") ?? form.get("image");
  if (!candidate) return null;
  if (typeof candidate === "string") return null;
  if (typeof (candidate as File).arrayBuffer !== "function") return null;
  return candidate as File;
}

async function readImageInput(request: Request): Promise<ImageInputResult> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, status: 400, error: "Malformed multipart body." };
    }

    const file = fileFromForm(form);
    if (!file) {
      return { ok: false, status: 400, error: "Missing imageFile." };
    }

    const fileNameRaw = form.get("fileName");
    const fileName =
      (typeof fileNameRaw === "string" ? fileNameRaw.trim() : "") ||
      file.name ||
      "packshot";

    const mime =
      normalizeImageMime(file.type) ||
      mimeFromFileName(fileName) ||
      mimeFromFileName(file.name);
    if (!mime) {
      return {
        ok: false,
        status: 415,
        error: "Unsupported image type. Use PNG, JPEG, WebP or AVIF.",
      };
    }

    if (!file.size) {
      return { ok: false, status: 400, error: "The image file is empty." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Image is larger than 8 MB. Compress it and try again.",
      };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = base64FromBytes(bytes);
    return {
      ok: true,
      image: {
        bytes,
        mime,
        base64,
        dataUrl: `data:${mime};base64,${base64}`,
        fileName: fileName.slice(0, 200),
      },
    };
  }

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      const parsed = (await request.json()) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, status: 400, error: "Invalid JSON body." };
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, status: 400, error: "Malformed JSON body." };
    }

    const imageDataUrl =
      typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    const parsed = parseImageDataUrl(imageDataUrl);
    if (!parsed.ok) {
      return { ok: false, status: parsed.status, error: parsed.error };
    }

    const fileNameRaw =
      typeof body.fileName === "string" ? body.fileName.trim() : "";
    return {
      ok: true,
      image: {
        bytes: parsed.image.bytes,
        mime: parsed.image.mime,
        base64: parsed.image.base64,
        dataUrl: parsed.image.dataUrl,
        fileName: (fileNameRaw || "packshot").slice(0, 200),
      },
    };
  }

  return {
    ok: false,
    status: 415,
    error:
      "Use multipart/form-data with imageFile, or JSON with { imageDataUrl, fileName }.",
  };
}

async function loadCatalog(env: VisionMatchEnv, tenantId: string | null): Promise<VisionCatalogProduct[]> {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name_arabic, p.name_english, p.category,
            p.verification_status, b.name_arabic AS brand_arabic,
            b.name_english AS brand_english, b.slug AS brand_slug
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     ${tenantId ? "WHERE p.tenant_key_id = ?" : ""}
     ORDER BY
       CASE WHEN p.verification_status = 'verified' THEN 1 ELSE 0 END,
       b.name_arabic, p.name_arabic, p.id
     LIMIT ?`,
  )
    .bind(...(tenantId ? [tenantId, CATALOG_LIMIT + 1] : [CATALOG_LIMIT + 1]))
    .all<VisionCatalogProduct>();

  return rows.results.slice(0, CATALOG_LIMIT);
}

function confidenceArabic(value: "high" | "medium" | "low"): string {
  if (value === "high") return "ثقة عالية";
  if (value === "medium") return "ثقة متوسطة";
  return "ثقة منخفضة";
}

export const onRequestPost: PagesFunction<VisionMatchEnv> = async ({
  request,
  env,
}) => {
  const scope = await resolveTenantScope(request, env);
  if (!scope.ok) return scope.response;

  const input = await readImageInput(request);
  if (!input.ok) {
    return noStore({ success: false, error: input.error }, input.status);
  }

  try {
    const catalog = await loadCatalog(env, scope.tenantId);
    if (catalog.length === 0) {
      return noStore(
        {
          success: false,
          error: "لا توجد منتجات في قاعدة البيانات للمطابقة.",
        },
        404,
      );
    }

    const outcome = await predictProductFromImage(
      env,
      {
        bytes: input.image.bytes,
        mime: input.image.mime,
        base64: input.image.base64,
      },
      input.image.fileName,
      catalog,
    );

    const { match } = outcome;
    const message = match.product
      ? `تمت مطابقة «${match.product.name_arabic}» (${confidenceArabic(
          match.confidence,
        )}). راجع المطابقة قبل الاعتماد.`
      : "لم تُطابق الصورة تلقائياً. اختر المنتج يدوياً من القائمة ثم اعتمد.";

    return noStore({
      success: true,
      match,
      vision: {
        geminiConfigured: outcome.geminiConfigured,
        workersAiBound: outcome.workersAiBound,
        provider: match.provider,
      },
      note: outcome.note,
      message,
      fileName: input.image.fileName,
      catalog: {
        scanned: catalog.length,
        limit: CATALOG_LIMIT,
      },
    });
  } catch (error) {
    console.error("Vision product matching failed.", error);
    return noStore(
      { success: false, error: "Unable to match the image against the catalog." },
      500,
    );
  }
};
