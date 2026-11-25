import { ADMIN_KEY_HEADER, type AuthEnv } from "../_auth";

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left[i]! ^ right[i]!;
  return result === 0;
}

/** Admin routes never accept annual tenant keys, including Bearer arh_… keys. */
export async function requireAdmin(request: Request, env: AuthEnv): Promise<Response | null> {
  const expected = (env.ADMIN_API_KEY ?? "").trim();
  if (!expected) return Response.json({ success: false, error: "Admin access is not configured." }, { status: 503 });
  const header = (request.headers.get(ADMIN_KEY_HEADER) ?? "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1]?.trim() ?? "";
  const supplied = header || bearer;
  if (!supplied || supplied.startsWith("arh_") || !equal(await digest(supplied), await digest(expected))) {
    return Response.json({ success: false, code: "admin_key_required", error: "A valid admin key is required." }, { status: 401, headers: { "WWW-Authenticate": `${ADMIN_KEY_HEADER} realm="idesign-admin"` } });
  }
  return null;
}

export function noStore(): Headers { return new Headers({ "Cache-Control": "no-store, max-age=0, must-revalidate" }); }
