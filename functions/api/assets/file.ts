/**
 * GET /api/assets/file?key=products/<productId>/<assetId>.<ext>
 *
 * Public read-only access to product packshots stored in the optional
 * `PRODUCT_ASSETS` R2 bucket. Only keys produced by `/api/assets/upload` are
 * accepted, so the bucket cannot be used as an open proxy.
 */

interface AssetObject {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size?: number;
}

interface AssetBucket {
  get: (key: string) => Promise<AssetObject | null>;
}

export interface AssetFileEnv {
  PRODUCT_ASSETS?: AssetBucket;
}

const KEY_PATTERN =
  /^products\/[A-Za-z0-9._-]+\/[A-Za-z0-9-]{8,}\.(png|jpg|jpeg|webp|avif)$/;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

export const onRequestGet: PagesFunction<AssetFileEnv> = async ({
  request,
  env,
}) => {
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();

  if (!key || key.length > 300 || key.includes("..") || !KEY_PATTERN.test(key)) {
    return Response.json(
      { success: false, error: "Invalid asset key." },
      { status: 400 },
    );
  }

  if (!env.PRODUCT_ASSETS) {
    return Response.json(
      {
        success: false,
        error: "The PRODUCT_ASSETS R2 bucket is not bound for this deployment.",
      },
      { status: 501 },
    );
  }

  try {
    const object = await env.PRODUCT_ASSETS.get(key);
    if (!object) {
      return Response.json(
        { success: false, error: "Asset not found." },
        { status: 404 },
      );
    }

    const extension = key.split(".").pop()?.toLowerCase() ?? "png";
    const contentType =
      object.httpMetadata?.contentType ?? CONTENT_TYPES[extension] ?? "image/png";

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.size) headers.set("Content-Length", String(object.size));

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to read a product asset from R2.", error);
    return Response.json(
      { success: false, error: "Unable to read the product image." },
      { status: 500 },
    );
  }
};
