// CORS origins allowed for Capacitor mobile app.
// Capacitor Android uses http://localhost, iOS uses capacitor://localhost.
const ALLOWED_ORIGINS = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
];

// How long (seconds) the browser may cache a preflight. Without it Chrome
// caches for 5s and repeats the OPTIONS trip before almost every chat message.
// Chrome caps this at 7200.
const PREFLIGHT_MAX_AGE = "7200";

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  // Exact match: a prefix check would let http://localhost.evil.com through.
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // Lets the app read detailed network timings (DNS, connect, request start)
    // via performance.getEntriesByType("resource"). Same origin as above only.
    ...(allowed ? { "Timing-Allow-Origin": origin } : {}),
  };
}

export function handleCorsOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), "Access-Control-Max-Age": PREFLIGHT_MAX_AGE },
  });
}
