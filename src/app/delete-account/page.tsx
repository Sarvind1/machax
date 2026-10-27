"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { setAnalyticsUser } from "@/lib/analytics";

const CONTACT = "sarvind@gritlabsai.co";

export default function DeleteAccountPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState("");

  const deleteAccount = useMutation(api.users.deleteAccount);

  // Prefill the username when opened from inside the app
  useEffect(() => {
    try {
      const stored = localStorage.getItem("machax-user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed?.username) setIdentifier(parsed.username);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (confirm.trim().toLowerCase() !== "delete") {
      setError('Type "delete" to confirm.');
      return;
    }
    setStatus("submitting");
    try {
      const result = await deleteAccount({ identifier: identifier.trim(), password });
      if (result.success) {
        for (const key of ["machax-user", "machax-session-mood", "machax-demo"]) {
          localStorage.removeItem(key);
        }
        setAnalyticsUser(null);
        setStatus("success");
      } else {
        setError("Wrong username/email or password.");
        setStatus("idle");
      }
    } catch {
      setError("Connection error. Try again.");
      setStatus("idle");
    }
  };

  if (status === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>account deleted</h1>
          <p style={styles.muted}>Your account, chats, settings and reports are gone for good.</p>
          <Link href="/" style={styles.link}>back to machax</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>delete your account</h1>
        <p style={styles.muted}>
          This permanently deletes your MachaX account, all conversations and messages, your pod settings,
          and any reports you filed. It can&apos;t be undone.
        </p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.field}>
            <span style={styles.label}>username or email</span>
            <input style={styles.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>password</span>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>type &quot;delete&quot; to confirm</span>
            <input style={styles.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.button} disabled={status === "submitting"}>
            {status === "submitting" ? "deleting..." : "delete my account"}
          </button>
        </form>
        <p style={{ ...styles.muted, marginTop: 20, fontSize: 13 }}>
          Can&apos;t sign in? Email <a href={`mailto:${CONTACT}`} style={styles.link}>{CONTACT}</a> from your
          account&apos;s email and we&apos;ll delete it within 30 days. See our <a href="/privacy" style={styles.link}>privacy policy</a>.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  card: { background: "#ffffff", border: "1.5px solid #dde0d4", borderRadius: 16, padding: "40px 32px", maxWidth: 420, width: "100%", textAlign: "center" },
  heading: { fontFamily: "var(--font-serif), serif", fontWeight: 700, fontSize: 24, letterSpacing: "-0.5px", margin: "0 0 8px", color: "#1a1e16" },
  muted: { color: "#5e6358", fontSize: 14, margin: "0 0 20px" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 4, textAlign: "left" },
  label: { fontSize: 12, fontWeight: 600, color: "#5e6358" },
  input: { padding: "12px 14px", border: "1.5px solid #dde0d4", borderRadius: 10, fontSize: 15, fontFamily: "inherit", background: "#ffffff", color: "#1a1e16", outline: "none" },
  error: { color: "#c0392b", fontSize: 13, textAlign: "left", margin: 0 },
  button: { padding: "13px 20px", background: "#c0392b", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 4 },
  link: { color: "#4a7c59", fontSize: "inherit", fontWeight: 600, textDecoration: "none" },
};
