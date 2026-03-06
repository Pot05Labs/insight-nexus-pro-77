/* ------------------------------------------------------------------ */
/*  Shared CORS helper for all SignalStack Edge Functions              */
/* ------------------------------------------------------------------ */

const ALLOWED_ORIGINS = [
  "https://signalstack.africa",
  "https://www.signalstack.africa",
];

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  if (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.includes(".lovable.app") ||
    origin.includes(".lovableproject.com") ||
    origin.startsWith("http://localhost")
  ) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** Standard preflight response for OPTIONS requests */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  return null;
}
