export const dynamic = "force-dynamic";

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "../../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

// ConvexHttpClient's types only accept public functions; the admin client can
// call internal ones (same narrowing as src/lib/bootstrap-user.ts).
type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Permanently delete the signed-in user's account and data. The Firebase ID
// token is the proof of ownership, so no password is needed.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const client = getConvexAdmin() as unknown as AdminMutations;
    await client.mutation(internal.users.deleteByUid, { uid: user.uid });
    return Response.json({ deleted: true }, { headers: corsHeaders(request) });
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("[api/account/delete] failed:", err);
    return Response.json(
      { error: "internal_error" },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}
