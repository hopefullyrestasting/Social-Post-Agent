/**
 * GET /api/proxy-image?url=...
 *
 * Same-origin image proxy for client-side Canvas rasterization (PNG/ZIP export).
 * Fetches a remote image and streams it back with permissive CORS headers so
 * external packshot hosts do not taint the canvas.
 *
 * Safety: only http(s) URLs, image content-types only, and private/local/loopback
 * targets are blocked to reduce SSRF exposure.
 */

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }

  // IPv4 literal checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map((n) => Number(n));
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  // IPv6 unique-local/link-local/loopback/mapped forms
  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
      return true; // fe80::/10
    }
    if (host.startsWith("::ffff:")) {
      // IPv4-mapped IPv6
      return isPrivateOrLocalHost(host.slice("::ffff:".length));
    }
  }

  return false;
}

function normalizeImageContentType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_IMAGE_TYPES.has(mime) ? mime : null;
}

interface ProxyEnv {
  DB?: D1Database;
  REQUIRE_ACCESS_KEY?: string;
}

export const onRequestGet: PagesFunction<ProxyEnv> = async ({ request, env }) => {
  // Tenant gate: once keys are provisioned, only authenticated tenants may
  // use the proxy. Legacy mode stays open.
  if (env?.DB) {
    const { resolveTenantScope } = await import("./_tenant");
    const scope = await resolveTenantScope(request, {
      DB: env.DB,
      REQUIRE_ACCESS_KEY: env.REQUIRE_ACCESS_KEY,
    });
    if (!scope.ok) return scope.response;
  }

  const url = new URL(request.url);
  const targetParam = url.searchParams.get("url");

  if (!targetParam) {
    return Response.json(
      { success: false, error: "Missing required 'url' query parameter." },
      { status: 400 },
    );
  }

  if (targetParam.length > 2048) {
    return Response.json(
      { success: false, error: "Target URL is too long." },
      { status: 400 },
    );
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return Response.json(
      { success: false, error: "Invalid target URL." },
      { status: 400 },
    );
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json(
      { success: false, error: "Only http(s) image URLs are allowed." },
      { status: 400 },
    );
  }

  if (target.username || target.password) {
    return Response.json(
      { success: false, error: "Credentials in target URL are not allowed." },
      { status: 400 },
    );
  }

  if (isPrivateOrLocalHost(target.hostname)) {
    return Response.json(
      { success: false, error: "Target host is not allowed." },
      { status: 403 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "AlRahma-Image-Proxy/1.0",
      },
    });
  } catch {
    return Response.json(
      { success: false, error: "Unable to fetch the requested image." },
      { status: 502 },
    );
  }

  // Re-check final URL after redirects
  try {
    const finalUrl = new URL(upstream.url || target.toString());
    if (
      (finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") ||
      isPrivateOrLocalHost(finalUrl.hostname)
    ) {
      return Response.json(
        { success: false, error: "Redirected target host is not allowed." },
        { status: 403 },
      );
    }
  } catch {
    // ignore parse issues, fall through to content-type checks
  }

  if (!upstream.ok) {
    return Response.json(
      { success: false, error: "Upstream image request failed." },
      { status: 502 },
    );
  }

  const contentType = normalizeImageContentType(
    upstream.headers.get("content-type"),
  );
  if (!contentType) {
    return Response.json(
      { success: false, error: "Target is not a supported image type." },
      { status: 415 },
    );
  }

  const lengthHeader = upstream.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return Response.json(
        { success: false, error: "Image is too large." },
        { status: 413 },
      );
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  if (lengthHeader) headers.set("Content-Length", lengthHeader);

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
