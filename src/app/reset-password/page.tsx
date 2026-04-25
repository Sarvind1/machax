"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.muted}>Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const resetPasswordMutation = useMutation(api.passwordResets.resetPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset link.");
      setStatus("error");
      return;
    }

    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setStatus("submitting");

    try {
      const result = await resetPasswordMutation({
        token,
        newPassword,
      });

      if (result.success) {
        setStatus("success");
      } else {
        setError(result.error || "Something went wrong.");
        setStatus("error");
      }
    } catch {
      setError("Connection error. Try again.");
      setStatus("error");
    }
  };

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>invalid link</h1>
          <p style={styles.muted}>This password reset link is invalid or missing.</p>
          <a href="/" style={styles.link}>back to login</a>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>password reset!</h1>
          <p style={styles.muted}>Your password has been updated. You can now log in.</p>
          <a href="/" style={styles.linkBtn}>go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>reset your password</h1>
        <p style={styles.muted}>Enter your new password below.</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="new-password">new password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="at least 4 characters"
              maxLength={64}
              disabled={status === "submitting"}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="confirm-password">confirm password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="type it again"
              maxLength={64}
              disabled={status === "submitting"}
              style={styles.input}
            />
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button
            type="submit"
            disabled={status === "submitting"}
            style={styles.button}
          >
            {status === "submitting" ? "resetting..." : "reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  card: {
    background: "#ffffff",
    border: "1.5px solid #dde0d4",
    borderRadius: "16px",
    padding: "40px 32px",
    maxWidth: "400px",
    width: "100%",
    textAlign: "center" as const,
  },
  heading: {
    fontFamily: "var(--font-serif), serif",
    fontWeight: 700,
    fontSize: "24px",
    letterSpacing: "-0.5px",
    margin: "0 0 8px",
    color: "#1a1e16",
  },
  muted: {
    color: "#5e6358",
    fontSize: "14px",
    margin: "0 0 20px",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    textAlign: "left" as const,
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#5e6358",
    textTransform: "lowercase" as const,
  },
  input: {
    padding: "12px 14px",
    border: "1.5px solid #dde0d4",
    borderRadius: "10px",
    fontSize: "15px",
    fontFamily: "inherit",
    background: "#ffffff",
    color: "#1a1e16",
    outline: "none",
  },
  error: {
    color: "#c0392b",
    fontSize: "13px",
    textAlign: "left" as const,
  },
  button: {
    padding: "13px 20px",
    background: "#4a7c59",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    marginTop: "4px",
  },
  link: {
    color: "#4a7c59",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
  },
  linkBtn: {
    display: "inline-block",
    padding: "12px 24px",
    background: "#4a7c59",
    color: "#fff",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
  },
};
