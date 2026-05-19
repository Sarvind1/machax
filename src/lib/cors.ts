// CORS origins allowed for Capacitor mobile app.
// Capacitor Android uses http://localhost, iOS uses capacitor://localhost.
const ALLOWED_ORIGINS = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
];

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function handleCorsOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
