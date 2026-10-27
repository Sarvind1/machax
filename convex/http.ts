import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { META_EVENTS, type MetaEventName } from "./metaCapi";

const http = httpRouter();

// Capacitor Android serves the app from https://localhost (iOS: capacitor://localhost)
const ALLOWED_ORIGINS = ["https://localhost", "http://localhost", "capacitor://localhost"];

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || undefined;
}

// Native app reports a signup / activation. The server checks it really happened,
// records it once, and forwards it to the Meta Conversions API.
// Responds { send: true } only for the first valid report, so the app logs its
// matching SDK event (same event_id) exactly once too.
http.route({
  path: "/meta/event",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { ...corsHeaders(request), "Content-Type": "application/json" };
    let body: {
      eventName?: string;
      eventId?: string;
      username?: string;
      advertiserTrackingEnabled?: boolean;
      extinfo?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ send: false }), { status: 400, headers });
    }
    const { eventName, eventId, username } = body;
    if (
      !eventName ||
      !META_EVENTS.includes(eventName as MetaEventName) ||
      !eventId ||
      eventId.length > 64 ||
      !username
    ) {
      return new Response(JSON.stringify({ send: false }), { status: 400, headers });
    }

    const claimed = await ctx.runMutation(internal.metaCapi.claim, {
      username,
      eventName: eventName as MetaEventName,
      eventId,
    });
    if (!claimed) return new Response(JSON.stringify({ send: false }), { status: 200, headers });

    // extinfo is Meta's fixed 16-slot device array; empty strings for unknowns
    const raw = Array.isArray(body.extinfo) ? body.extinfo : [];
    const extinfo = Array.from({ length: 16 }, (_, i) => String(raw[i] ?? "").slice(0, 100));
    extinfo[0] = "a2";
    // Meta rejects the event without an OS version; fall back to the webview's user agent
    const userAgent = request.headers.get("user-agent") ?? undefined;
    if (!extinfo[4]) extinfo[4] = userAgent?.match(/Android ([\d.]+)/)?.[1] ?? "";

    await ctx.scheduler.runAfter(0, internal.metaCapi.send, {
      eventName,
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      username,
      email: claimed.email,
      clientIp: clientIp(request),
      userAgent,
      advertiserTrackingEnabled: body.advertiserTrackingEnabled !== false,
      extinfo,
    });
    return new Response(JSON.stringify({ send: true }), { status: 200, headers });
  }),
});

http.route({
  path: "/meta/event",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: corsHeaders(request) })),
});

export default http;
