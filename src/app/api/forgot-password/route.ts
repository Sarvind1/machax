import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Resend } from "resend";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder_key") return null;
  return new Resend(key);
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return Response.json({ success: true });
    }

    const result = await convex.mutation(api.passwordResets.createReset, {
      email: email.trim(),
    });

    if (result.token) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://machax.xyz";
      const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;

      const resend = getResend();
      if (!resend) {
        console.warn("RESEND_API_KEY not configured, skipping email");
        return Response.json({ success: true });
      }

      // NOTE: With onboarding@resend.dev (Resend's shared sender), emails can
      // only be delivered to the Resend account owner's email. To send to any
      // user, add and verify a custom domain in Resend, then update the "from"
      // address below.
      const { data, error } = await resend.emails.send({
        from: "MachaX <onboarding@resend.dev>",
        to: email.trim(),
        subject: "Reset your MachaX password",
        text: `Hey,\n\nSomeone requested a password reset for your MachaX account.\n\nClick here to reset: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\n— machax`,
      });

      if (error) {
        console.error("[forgot-password] Resend error:", JSON.stringify(error));
      } else {
        console.log("[forgot-password] Email sent, id:", data?.id);
      }
    }

    // Always return success to not reveal if email exists
    return Response.json({ success: true });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return Response.json({ success: true });
  }
}
