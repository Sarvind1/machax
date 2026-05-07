import { internalMutation, action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateSalt, hashPassword } from "./lib/passwords";

// Internal-only: not callable from the client.
export const createReset = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Check if email exists in users table
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { token: null, email };
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.insert("passwordResets", {
      email,
      token,
      expiresAt,
      used: false,
    });

    return { token, email };
  },
});

// Public action: creates a reset token and sends the email.
// Returns only { success: true } — never exposes the token.
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const result = await ctx.runMutation(
      internal.passwordResets.createReset,
      { email }
    );

    if (result.token) {
      const resendKey = process.env.RESEND_API_KEY;
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://machax.xyz";

      if (!resendKey || resendKey === "re_placeholder_key") {
        console.warn("RESEND_API_KEY not configured, skipping email");
        return { success: true };
      }

      const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;

      // NOTE: With onboarding@resend.dev (Resend's shared sender), emails can
      // only be delivered to the Resend account owner's email. To send to any
      // user, add and verify a custom domain in Resend, then update the "from"
      // address below.
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "MachaX <noreply@machax.xyz>",
            reply_to: "sarvindrankawat@gmail.com",
            to: email,
            subject: "Reset your MachaX password",
            text: `Hey,\n\nSomeone requested a password reset for your MachaX account.\n\nClick here to reset: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\n— machax`,
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          console.error("[forgot-password] Resend error:", errorBody);
        } else {
          const data = await res.json();
          console.log("[forgot-password] Email sent, id:", data?.id);
        }
      } catch (err) {
        console.error("[forgot-password] Email send failed:", err);
      }
    }

    // Always return success to not reveal if email exists
    return { success: true };
  },
});

export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { token, newPassword }) => {
    const reset = await ctx.db
      .query("passwordResets")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!reset) {
      return { success: false, error: "Invalid reset link." };
    }

    if (reset.used) {
      return { success: false, error: "This reset link has already been used." };
    }

    if (Date.now() > reset.expiresAt) {
      return { success: false, error: "This reset link has expired." };
    }

    // Find the user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", reset.email))
      .first();

    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Hash the new password with a fresh salt
    const salt = generateSalt();
    const hashedPassword = await hashPassword(newPassword, salt);

    // Update the password
    await ctx.db.patch(user._id, { password: hashedPassword, salt });

    // Mark token as used
    await ctx.db.patch(reset._id, { used: true });

    return { success: true };
  },
});
