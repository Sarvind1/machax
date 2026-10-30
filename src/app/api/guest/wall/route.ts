export const dynamic = "force-dynamic";

import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { recordSignInWall } from "@/lib/chat-log";
import { GUEST_ID_RE } from "@/lib/guest-limits";

// The chat page shows the sign-in wall itself when it already knows the guest
// is out of free messages, without calling /api/chat. It reports that here so
// every wall hit is counted server-side (source "client"). No auth: a guest id
// is all a guest has. One row per guest per 30 s (deduped in Convex).

const REASONS = new Set(["typed_limit", "cap"]);

type AdminMutations = Parameters<typeof recordSignInWall>[0];

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  const body = (await request.json().catch(() => null)) as {
    guestId?: unknown;
    reason?: unknown;
    typedUsed?: unknown;
    totalUsed?: unknown;
    conversationId?: unknown;
  } | null;
  if (!body || typeof body.guestId !== "string" || !GUEST_ID_RE.test(body.guestId)) {
    return Response.json({ error: "bad_request" }, { status: 400, headers: cors });
  }
  const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 1000 ? n : undefined);
  const typedUsed = count(body.typedUsed);
  const totalUsed = count(body.totalUsed);
  const conversationId =
    typeof body.conversationId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.conversationId)
      ? body.conversationId
      : undefined;
  await recordSignInWall(getConvexAdmin() as unknown as AdminMutations, request, {
    guestKey: `g:${body.guestId}`,
    source: "client",
    reason: typeof body.reason === "string" && REASONS.has(body.reason) ? body.reason : "unknown",
    ...(typedUsed !== undefined ? { typedUsed } : {}),
    ...(totalUsed !== undefined ? { totalUsed } : {}),
    ...(conversationId ? { conversationId } : {}),
  });
  return new Response(null, { status: 204, headers: cors });
}
