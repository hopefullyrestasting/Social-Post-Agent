export const ACCESS_KEY_STORAGE_KEY = "al-rahma-access-key";
export const ACCESS_KEY_HEADER = "X-Access-Key";
export const ACCESS_KEY_COOKIE = "al_rahma_access_key";

/** Cookie fallback covers restored browser sessions and <img> asset loads. */
function readAccessKeyCookie(): string {
  if (typeof document === "undefined") return "";
  try {
    for (const part of document.cookie.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() !== ACCESS_KEY_COOKIE) continue;
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  } catch {
    // Storage/cookies can be blocked.
  }
  return "";
}

export function readAccessKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY) ?? "";
    if (stored.trim()) return stored.trim();
  } catch {
    // Storage can be blocked (private mode).
  }
  return readAccessKeyCookie().trim();
}

export function persistAccessKey(value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim();
    if (trimmed) {
      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, trimmed);
      document.cookie = `${ACCESS_KEY_COOKIE}=${encodeURIComponent(trimmed)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } else {
      window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
      document.cookie = `${ACCESS_KEY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  } catch {
    // Storage can be blocked (private mode).
  }
}

export function accessKeyHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = readAccessKey();
  return key ? { ...extra, [ACCESS_KEY_HEADER]: key } : { ...extra };
}

let fetchPatched = false;

/**
 * Patches global fetch once so every same-origin /api request carries the
 * access key. Lets child components (which call fetch directly) stay unchanged.
 */
export function installAccessKeyFetch(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const resolved = new URL(url, window.location.href);
      const isApi = resolved.origin === window.location.origin && resolved.pathname.startsWith("/api/");
      const key = readAccessKey();
      if (isApi && key) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has(ACCESS_KEY_HEADER)) headers.set(ACCESS_KEY_HEADER, key);
        init = { ...init, headers };
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
}
