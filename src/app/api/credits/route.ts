export const dynamic = "force-dynamic";

import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { summarize } from "@/lib/credits";
import { authErrorResponse } from "@/lib/server-auth";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Current credit summary for the signed-in user. Creates the account's
// credits row (with the one-time $1 grant) on first call.
export async function GET(request: Request) {
  try {
    const { row } = await bootstrapUser(request);
    return Response.json(summarize(row), { headers: corsHeaders(request) });
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("[api/credits] failed:", err);
    return Response.json(
      { error: "internal_error" },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
