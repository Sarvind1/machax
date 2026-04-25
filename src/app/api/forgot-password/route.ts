import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Resend } from "resend";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const resend = new Resend(process.env.RESEND_API_KEY);

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

      await resend.emails.send({
        from: "MachaX <noreply@machax.xyz>",
        to: email.trim(),
        subject: "Reset your MachaX password",
        text: `Hey,\n\nSomeone requested a password reset for your MachaX account.\n\nClick here to reset: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\n— machax`,
      });
    }

    // Always return success to not reveal if email exists
    return Response.json({ success: true });
  } catch {
    return Response.json({ success: true });
  }
}
