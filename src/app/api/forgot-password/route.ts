import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return Response.json({ success: true }, { headers: cors });
    }

    // The Convex action handles token creation and email sending internally.
    // It never exposes the reset token to any caller.
    await convex.action(api.passwordResets.requestPasswordReset, {
      email: email.trim(),
    });

    // Always return success to not reveal if email exists
    return Response.json({ success: true }, { headers: cors });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return Response.json({ success: true }, { headers: cors });
  }
}
