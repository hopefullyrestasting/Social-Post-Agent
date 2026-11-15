/**
 * Browser-only helper for the admin write key.
 *
 * The key lives in `localStorage` and is sent as `X-Admin-Key` on every write.
 * It is never bundled, logged or committed: only the operator's browser holds
 * it, and Cloudflare compares it to the `ADMIN_API_KEY` binding.
 */

export const ADMIN_KEY_STORAGE_KEY = "al-rahma-admin-key";
export const ADMIN_KEY_HEADER = "X-Admin-Key";

export function readAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistAdminKey(value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim();
    if (trimmed) {
      window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    }
  } catch {
    // Storage can be blocked (private mode); writes then simply carry no key.
  }
}

/** Headers for a state-mutating request. */
export function adminWriteHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const key = readAdminKey();
  return key ? { ...extra, [ADMIN_KEY_HEADER]: key } : { ...extra };
}
