// Strict CORS & JSON response helpers for SocialRelay Edge Functions

const DEFAULT_ORIGINS = [
  "https://j5pecter.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const extraOrigin = Deno.env.get("APP_ORIGIN") ?? "";
  const allowed = extraOrigin ? [...DEFAULT_ORIGINS, extraOrigin] : DEFAULT_ORIGINS;
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(req: Request, message: string, status = 400): Response {
  return jsonResponse(req, { error: message, detail: message }, status);
}
