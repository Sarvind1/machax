"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setAnalyticsUser } from "@/lib/analytics";
import {
  completeRedirectSignIn,
  deleteCurrentUser,
  getIdToken,
  onAuthChange,
  signInWithGoogle,
  signOut,
  type AuthedUserClient,
} from "@/lib/firebase";
import { authedFetch, AuthRequired } from "@/lib/api";

const CONTACT = "sarvind@gritlabsai.co";
const SIGN_IN_RECORD_KEPT =
  "your data is deleted. sign out and back in, then delete once more to remove your google sign-in record.";

// Account deletion for Google sign-in users. The Firebase ID token proves
// ownership, so the only extra step is typing "delete" to confirm.
export default function DeleteAccountPage() {
  const router = useRouter();
  // undefined = still checking, null = not signed in
  const [user, setUser] = useState<AuthedUserClient | null | undefined>(undefined);
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "signing-in" | "submitting" | "success">("idle");
  const [error, setError] = useState("");
  // Set when the app data is gone but Firebase kept the Google sign-in record.
  const [signInKept, setSignInKept] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    let unmounted = false;
    (async () => {
      try {
        await completeRedirectSignIn();
        await getIdToken(); // waits for the saved session to load
        // Unmounted during the awaits: don't attach a listener nobody removes.
        if (unmounted) return;
        unsub = onAuthChange(setUser);
      } catch (err) {
        console.error("[delete-account] auth unavailable:", err);
        if (!unmounted) setUser(null);
      }
    })();
    return () => {
      unmounted = true;
      unsub();
    };
  }, []);

  // After success, sign-out has already happened; send them to login. Not when
  // there is a note to read about the sign-in record.
  useEffect(() => {
    if (status !== "success" || signInKept) return;
    const timer = setTimeout(() => router.replace("/login"), 2500);
    return () => clearTimeout(timer);
  }, [status, signInKept, router]);

  const handleSignIn = async () => {
    setError("");
    setStatus("signing-in");
    try {
      setUser(await signInWithGoogle());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|popup-closed/i.test(msg)) {
        console.error("[delete-account] sign-in failed:", err);
        setError("Couldn't sign you in. Try again.");
      }
    }
    setStatus("idle");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (confirm.trim().toLowerCase() !== "delete") {
      setError('Type "delete" to confirm.');
      return;
    }
    setStatus("submitting");
    try {
      const res = await authedFetch("/api/account/delete", { method: "POST" });
      if (res.status === 401) throw new AuthRequired();
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      // App data is gone; now the Google sign-in record in Firebase Auth.
      const firebaseUser = await deleteCurrentUser();
      setSignInKept(firebaseUser === "kept");
      for (const key of ["machax-session-mood", "machax-demo"]) localStorage.removeItem(key);
      setAnalyticsUser(null);
      await signOut().catch(() => {});
      setStatus("success");
    } catch (err) {
      if (err instanceof AuthRequired) {
        await signOut().catch(() => {});
        setUser(null);
        setError("Your session expired. Sign in again to continue.");
      } else {
        console.error("[delete-account] failed:", err);
        setError("Connection error. Try again.");
      }
      setStatus("idle");
    }
  };

  if (status === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>account deleted</h1>
          <p style={styles.muted}>
            your profile, chats, settings, credit balance and reports are gone for good. payment and credit records
            stay for our financial records, under an id that no longer links to you.
          </p>
          {signInKept && <p style={styles.error}>{SIGN_IN_RECORD_KEPT}</p>}
          <Link href="/login" style={styles.link}>back to machax</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>delete your account</h1>
        <p style={styles.muted}>
          this permanently deletes your machax profile, all conversations and messages, your pod settings,
          your credit balance, any reports you filed, and your google sign-in record. it can&apos;t be undone.
          payment and credit records are kept for our financial records, without your name, email or chats.
        </p>
        {user === undefined ? (
          <p style={styles.muted}>checking your sign-in&hellip;</p>
        ) : user === null ? (
          <div style={styles.form}>
            <p style={{ ...styles.muted, margin: 0 }}>Sign in with the Google account you use for MachaX.</p>
            {error && <p style={styles.error}>{error}</p>}
            <button type="button" style={styles.google} onClick={handleSignIn} disabled={status === "signing-in"}>
              {status === "signing-in" ? "signing in..." : "continue with google"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <p style={{ ...styles.muted, margin: 0 }}>
              Signed in as <strong>{user.email ?? user.name ?? "your Google account"}</strong>.
            </p>
            <label style={styles.field}>
              <span style={styles.label}>type &quot;delete&quot; to confirm</span>
              <input style={styles.input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.button} disabled={status === "submitting"}>
              {status === "submitting" ? "deleting..." : "delete my account"}
            </button>
          </form>
        )}
        <p style={{ ...styles.muted, marginTop: 20, fontSize: 13 }}>
          Can&apos;t sign in? Email <a href={`mailto:${CONTACT}`} style={styles.link}>{CONTACT}</a>{" "}from your
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
  google: { padding: "13px 20px", background: "#ffffff", color: "#1a1e16", border: "1.5px solid #dde0d4", borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" },
  link: { color: "#4a7c59", fontSize: "inherit", fontWeight: 600, textDecoration: "none" },
};
