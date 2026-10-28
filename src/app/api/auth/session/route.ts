export const dynamic = "force-dynamic";

import { internal } from "../../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { summarize } from "@/lib/credits";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Bootstrap after login: link or create the app user for this Firebase
// account, make sure it has a credits row, and return both.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const client = getConvexAdmin() as any;
    const { username, name } = await client.mutation(internal.users.upsertFromFirebase, {
      uid: user.uid,
      email: user.email,
      name: user.name,
    });
    const row = await client.mutation(internal.credits.ensure, { uid: user.uid, username });
    return Response.json(
      { uid: user.uid, username, name, credits: summarize(row) },
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
