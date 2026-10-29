export const dynamic = "force-dynamic";

import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { summarize } from "@/lib/credits";
import { authErrorResponse } from "@/lib/server-auth";
import { getConvexAdmin, type InternalAdmin } from "@/lib/convex-server";
import { GUEST_ID_RE } from "@/lib/guest-limits";
import { internal } from "../../../../../convex/_generated/api";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Bootstrap after login: link or create the app user for this Firebase
// account, make sure it has a credits row, and return both.
// Optional body { guestId }: the chats this device had as a guest move to the
// account. guestClaim.activated = one of them already has a picked decision.
export async function POST(request: Request) {
  try {
    const { user, username, name, row } = await bootstrapUser(request);
    const body = (await request.json().catch(() => null)) as { guestId?: unknown } | null;
    let guestClaim: { moved: number; activated: boolean } | undefined;
    if (typeof body?.guestId === "string" && GUEST_ID_RE.test(body.guestId)) {
      try {
        const convex = getConvexAdmin() as unknown as InternalAdmin;
        guestClaim = await convex.mutation(internal.guests.claimGuest, { guestId: body.guestId, username });
      } catch (err) {
        // Sign-in still works; the guest chat just stays where it was.
        console.error("[api/auth/session] guest claim failed:", err);
      }
    }
    return Response.json(
      { uid: user.uid, username, name, credits: summarize(row), ...(guestClaim ? { guestClaim } : {}) },
      { headers: corsHeaders(request) },
    );
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("[api/auth/session] failed:", err);
    return Response.json(
      { error: "internal_error" },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
