export const dynamic = "force-dynamic";

import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { summarize } from "@/lib/credits";
import { authErrorResponse } from "@/lib/server-auth";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Bootstrap after login: link or create the app user for this Firebase
// account, make sure it has a credits row, and return both.
export async function POST(request: Request) {
  try {
    const { user, username, name, row } = await bootstrapUser(request);
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
