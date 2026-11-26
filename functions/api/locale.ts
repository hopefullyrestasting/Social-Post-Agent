import { detectLanguage } from "../../src/lib/al-rahma/i18n";

interface GeoRequest extends Request {
  cf?: { country?: string };
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const geoRequest = request as GeoRequest;
  const language = detectLanguage({
    country: geoRequest.cf?.country,
    acceptLanguage: request.headers.get("Accept-Language"),
  });
  return Response.json(
    { success: true, language },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
};
