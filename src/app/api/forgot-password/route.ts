import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return Response.json({ success: true });
    }

    // The Convex action handles token creation and email sending internally.
    // It never exposes the reset token to any caller.
    await convex.action(api.passwordResets.requestPasswordReset, {
      email: email.trim(),
    });

    // Always return success to not reveal if email exists
    return Response.json({ success: true });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return Response.json({ success: true });
  }
}
