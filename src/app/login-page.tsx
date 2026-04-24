"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import "./login.css";

/* ===== HELPERS ===== */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
  return Promise.race([promise, timeout]);
}

let idCounter = 0;
function uid(): string {
  return `m-${Date.now()}-${++idCounter}`;
}

/* ===== PREVIEW CONVERSATION POOLS ===== */

type PreviewLine = [agent: string, name: string, role: string, text: string, color: string];

const PREVIEW_POOLS: PreviewLine[][] = [
  // Pool 1: career anxiety
  [
    ["reeva", "reeva", "the empath", "omg should i quit my job or is that just monday brain", "#6BAE7E"],
    ["aarushi", "aarushi", "the hype", "QUIT. do it. life's too short bestie", "#D28AA8"],
    ["noor", "noor", "the analyst", "ok wait. savings? runway? let's not be impulsive", "#7BA5C4"],
    ["ananya", "ananya", "the vibe", "hmm", "#B8A88A"],
    ["boss", "boss", "the judge", "ruling: sleep on it. revisit thursday.", "oklch(0.78 0.11 175)"],
    ["reeva", "reeva", "the empath", "but what if thursday me is also miserable", "#6BAE7E"],
    ["didi", "didi", "the anchor", "then we talk again thursday. that's the point.", "oklch(0.88 0.08 130)"],
  ],
  // Pool 2: relationship drama
  [
    ["fomo", "fomo", "the worrier", "they left me on read for 6 hours. should i double text?", "oklch(0.82 0.11 25)"],
    ["hype", "hype", "the hype", "absolutely not. maintain your dignity", "oklch(0.80 0.11 305)"],
    ["didi", "didi", "the anchor", "what did you send them?", "oklch(0.88 0.08 130)"],
    ["fomo", "fomo", "the worrier", "a meme about cats", "oklch(0.82 0.11 25)"],
    ["boss", "boss", "the judge", "...that's not a conversation starter", "oklch(0.78 0.11 175)"],
    ["reeva", "reeva", "the empath", "send a voice note. voice notes hit different", "#6BAE7E"],
    ["didi", "didi", "the anchor", "or just... wait. 6 hours is nothing.", "oklch(0.88 0.08 130)"],
  ],
  // Pool 3: life decisions
  [
    ["simran", "simran", "the feeler", "i want to move to goa but my parents will lose it", "#C4A07B"],
    ["boss", "boss", "the judge", "what's the job situation there?", "oklch(0.78 0.11 175)"],
    ["simran", "simran", "the feeler", "remote. same salary.", "#C4A07B"],
    ["hype", "hype", "the hype", "then WHAT are we discussing. GO", "oklch(0.80 0.11 305)"],
    ["noor", "noor", "the analyst", "cost of living comparison first. rent in goa vs your city?", "#7BA5C4"],
    ["didi", "didi", "the anchor", "have the conversation with your parents. you might be surprised.", "oklch(0.88 0.08 130)"],
    ["fomo", "fomo", "the worrier", "what if goa gets boring after 3 months though", "oklch(0.82 0.11 25)"],
  ],
  // Pool 4: everyday overthinking
  [
    ["priya", "priya", "the helper", "should i get the macbook or the thinkpad", "#9BB07E"],
    ["aarushi", "aarushi", "the hype", "macbook. always macbook. this isn't even a question", "#D28AA8"],
    ["noor", "noor", "the analyst", "specs? budget? use case?", "#7BA5C4"],
    ["priya", "priya", "the helper", "coding + youtube + looking cool at cafes", "#9BB07E"],
    ["ananya", "ananya", "the vibe", "thinkpad", "#B8A88A"],
    ["boss", "boss", "the judge", "thinkpad for work. macbook for ego.", "oklch(0.78 0.11 175)"],
    ["didi", "didi", "the anchor", "buy whichever one you won't return in 3 days", "oklch(0.88 0.08 130)"],
  ],
];

interface PreviewMessage {
  id: string;
  name: string;
  role: string;
  text: string;
  color: string;
}

/* ===== TYPES ===== */

/* ===== VALIDATION ===== */

function validateLoginForm(data: { username: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.username.trim().length < 3) errors.username = "enter your username or email";
  if (data.password.length < 4) errors.password = "at least 4 characters";
  return errors;
}

function validateSignupForm(data: { name: string; email: string; city: string; age: string; username: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.name.trim().length < 1) errors.name = "we need a name";
  if (!data.email.trim()) errors.email = "email required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = "enter a valid email";
  if (data.city.trim().length < 1) errors.city = "city?";
  const ageNum = parseInt(data.age, 10);
  if (!data.age.trim() || isNaN(ageNum) || ageNum < 13 || ageNum > 120) errors.age = "enter a valid age (13-120)";
  if (data.username.trim().length < 3) errors.username = "at least 3 characters";
  else if (!/^[a-z0-9_.-]+$/.test(data.username.trim())) errors.username = "lowercase letters, numbers, _ . - only";
  if (data.password.length < 4) errors.password = "at least 4 characters";
  return errors;
}

/* ===== COMPONENT ===== */

export default function LoginPage() {
  const router = useRouter();
  const signupMutation = useMutation(api.users.signup);
  const loginMutation = useMutation(api.users.login);

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [formData, setFormData] = useState({ name: "", email: "", city: "", age: "", username: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [victory, setVictory] = useState<{ username: string; isNew: boolean } | null>(null);
  const [navigating, setNavigating] = useState(false);

  const bootedRef = useRef(false);
  const abortRef = useRef(0); // incremented on tab switch to cancel in-flight flows

  // Preview chat state
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewTyping, setPreviewTyping] = useState<{ name: string; color: string } | null>(null);
  const previewAbortRef = useRef(0);
  const previewStreamRef = useRef<HTMLDivElement>(null);

  // Auto-scroll preview stream
  useEffect(() => {
    const el = previewStreamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [previewMessages, previewTyping]);

  // Preview auto-play loop
  useEffect(() => {
    const token = ++previewAbortRef.current;

    async function runLoop() {
      while (previewAbortRef.current === token) {
        const pool = PREVIEW_POOLS[Math.floor(Math.random() * PREVIEW_POOLS.length)];
        setPreviewMessages([]);
        setPreviewTyping(null);

        for (const line of pool) {
          if (previewAbortRef.current !== token) return;
          const [, name, role, text, color] = line;

          // Show typing indicator
          setPreviewTyping({ name, color });
          await wait(800 + Math.random() * 400);
          if (previewAbortRef.current !== token) return;

          // Add message
          setPreviewTyping(null);
          setPreviewMessages((prev) => [...prev, { id: uid(), name, role, text, color }]);
          await wait(1500 + Math.random() * 1500);
        }

        if (previewAbortRef.current !== token) return;
        // Pause before next pool
        await wait(3000);
      }
    }

    runLoop();
    return () => { previewAbortRef.current++; };
  }, []);

  /* ===== BOOT ===== */

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // Check existing session — redirect if already logged in
    try {
      const stored = localStorage.getItem("machax-user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.username) {
          router.push("/chat");
        }
      }
    } catch {
      // ignore
    }
  }, [router]);

  /* ===== TAB SWITCH ===== */

  const handleTabSwitch = useCallback((tab: "login" | "signup") => {
    if (tab === activeTab && !victory) return;
    abortRef.current++;
    setActiveTab(tab);
    setFormData({ name: "", email: "", city: "", age: "", username: "", password: "" });
    setErrors({});
    setSubmitting(false);
    setVictory(null);
  }, [activeTab, victory]);

  /* ===== FORM FIELD HANDLER ===== */

  const updateField = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field on change
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /* ===== SUBMIT: LOGIN ===== */

  const handleLoginSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateLoginForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const token = abortRef.current;
    setSubmitting(true);
    setErrors({});

    try {
      const result = await withTimeout(
        loginMutation({ identifier: formData.username.trim(), password: formData.password }),
        10000
      );

      if (abortRef.current !== token) return;

      if (result.success) {
        const name = result.name ?? formData.username.trim();
        localStorage.setItem("machax-user", JSON.stringify({ username: formData.username.trim(), name }));
        setVictory({ username: formData.username.trim(), isNew: false });
      } else if (result.error === "not_found") {
        setErrors({ username: "username not found" });
      } else {
        setErrors({ password: "wrong password" });
      }
    } catch {
      if (abortRef.current !== token) return;
      setErrors({ username: "connection error. try again." });
    } finally {
      if (abortRef.current === token) {
        setSubmitting(false);
      }
    }
  }, [submitting, formData, loginMutation]);

  /* ===== SUBMIT: SIGNUP ===== */

  const handleSignupSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateSignupForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const token = abortRef.current;
    setSubmitting(true);
    setErrors({});

    try {
      const result = await withTimeout(
        signupMutation({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          name: formData.name.trim(),
          city: formData.city.trim(),
          age: parseInt(formData.age, 10),
        }),
        10000
      );

      if (abortRef.current !== token) return;

      if (result.success) {
        localStorage.setItem("machax-user", JSON.stringify({ username: formData.username.trim(), name: formData.name.trim() }));
        setVictory({ username: formData.username.trim(), isNew: true });
      } else if (result.error === "username_taken") {
        setErrors({ username: "username already taken" });
      } else if (result.error === "email_taken") {
        setErrors({ email: "email already in use" });
      }
    } catch {
      if (abortRef.current !== token) return;
      setErrors({ username: "connection error. try again." });
    } finally {
      if (abortRef.current === token) {
        setSubmitting(false);
      }
    }
  }, [submitting, formData, signupMutation]);

  /* ===== FORGOT PASSWORD ===== */

  const handleForgotPassword = useCallback(() => {
    // For now, just show an alert or a simple message
    // In the future this will send a reset email
    alert("Password reset coming soon! For now, try signing up with a new account.");
  }, []);

  /* ===== AUTO-REDIRECT AFTER VICTORY ===== */

  useEffect(() => {
    if (victory) {
      const timer = setTimeout(() => {
        router.push("/chat");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [victory, router]);

  /* ===== OPEN CHAT ===== */

  const handleOpenChat = useCallback(() => {
    setNavigating(true);
    router.push("/chat");
  }, [router]);

  /* ===== RENDER ===== */

  return (
    <div className="login-page">
      {/* Topbar */}
      <div className="login-topbar">
        <span className="login-wordmark">macha<em>X</em></span>
        <span className="login-status">
          <span className="login-status-dot" />
          council is online &middot; bengaluru
        </span>
      </div>

      {/* Shell */}
      <div className="login-shell">
        {/* Intro */}
        <div className="login-intro">
          <h1>first, <em>who dis?</em></h1>
          <p>the council needs to know before they let you in.</p>
          <div className="login-tabs">
            <button
              className={`login-tab ${activeTab === "login" ? "login-tab--active" : ""}`}
              onClick={() => handleTabSwitch("login")}
            >
              log in
            </button>
            <button
              className={`login-tab ${activeTab === "signup" ? "login-tab--active" : ""}`}
              onClick={() => handleTabSwitch("signup")}
            >
              sign up
            </button>
          </div>
        </div>

        {/* Split layout: form left, preview right */}
        <div className="login-content">
          {/* Left column: form + deliberation messages */}
          <div className="login-content-left">
            <div className="login-form-card">
              {activeTab === "login" ? (
                <form onSubmit={handleLoginSubmit} noValidate>
                  <div className="login-field">
                    <label htmlFor="login-username">username or email</label>
                    <input
                      id="login-username"
                      type="text"
                      value={formData.username}
                      onChange={(e) => updateField("username", e.target.value)}
                      placeholder="username or email"
                      autoComplete="username"
                      maxLength={64}
                      disabled={submitting}
                    />
                    {errors.username && <div className="login-field-error">{errors.username}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="login-password">password</label>
                    <input
                      id="login-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      maxLength={64}
                      disabled={submitting}
                    />
                    {errors.password && <div className="login-field-error">{errors.password}</div>}
                  </div>
                  <button className="login-submit-btn" type="submit" disabled={submitting}>
                    {submitting ? "checking\u2026" : "log in \u2192"}
                  </button>
                  <div className="login-forgot-link">
                    <button type="button" className="login-forgot-btn" onClick={handleForgotPassword}>
                      forgot password?
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSignupSubmit} noValidate>
                  <div className="login-field">
                    <label htmlFor="signup-name">name</label>
                    <input
                      id="signup-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="first name is fine"
                      autoComplete="given-name"
                      maxLength={32}
                      disabled={submitting}
                    />
                    {errors.name && <div className="login-field-error">{errors.name}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="signup-email">email</label>
                    <input
                      id="signup-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      maxLength={64}
                      disabled={submitting}
                    />
                    {errors.email && <div className="login-field-error">{errors.email}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="signup-city">city</label>
                    <input
                      id="signup-city"
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      placeholder="e.g. bengaluru"
                      autoComplete="address-level2"
                      maxLength={32}
                      disabled={submitting}
                    />
                    {errors.city && <div className="login-field-error">{errors.city}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="signup-age">age</label>
                    <input
                      id="signup-age"
                      type="text"
                      inputMode="numeric"
                      value={formData.age}
                      onChange={(e) => updateField("age", e.target.value)}
                      placeholder="just a number"
                      autoComplete="off"
                      maxLength={3}
                      disabled={submitting}
                    />
                    {errors.age && <div className="login-field-error">{errors.age}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="signup-username">username</label>
                    <input
                      id="signup-username"
                      type="text"
                      value={formData.username}
                      onChange={(e) => updateField("username", e.target.value)}
                      placeholder="lowercase, no spaces"
                      autoComplete="username"
                      maxLength={32}
                      disabled={submitting}
                    />
                    {errors.username && <div className="login-field-error">{errors.username}</div>}
                  </div>
                  <div className="login-field">
                    <label htmlFor="signup-password">password</label>
                    <input
                      id="signup-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      maxLength={64}
                      disabled={submitting}
                    />
                    {errors.password && <div className="login-field-error">{errors.password}</div>}
                  </div>
                  <button className="login-submit-btn" type="submit" disabled={submitting}>
                    {submitting ? "checking\u2026" : "sign up \u2192"}
                  </button>
                </form>
              )}

              {/* Divider */}
              <div className="login-divider">
                <span>or continue with</span>
              </div>

              {/* Google button (placeholder) */}
              <button className="login-google" disabled>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                continue with google
                <span className="login-soon">soon</span>
              </button>
            </div>

            {/* Victory card (replaces form after successful login/signup) */}
            {victory && (
              <div className="login-victory">
                <h2>{victory.isNew ? "welcome in" : "welcome back"}, <em>{victory.username}</em>.</h2>
                <p>the council is seated. whenever you&apos;re ready &mdash; dump the messy thought.</p>
                <button className="login-victory-btn" onClick={handleOpenChat} disabled={navigating}>
                  {navigating ? "opening\u2026" : "open chat \u2192"}
                </button>
              </div>
            )}
          </div>

          {/* Right column: chat preview */}
          <div className="login-content-right">
            <div className="login-preview">
              <div className="login-preview-header">live from the lounge</div>
              <div className="login-preview-stream" ref={previewStreamRef}>
                {previewMessages.map((pm) => (
                  <div key={pm.id} className="login-preview-msg">
                    <div className="login-preview-who">
                      <span className="login-pip" style={{ background: pm.color }} />
                      <span className="login-preview-who-name">{pm.name}</span>
                      <span className="login-preview-who-role">{pm.role}</span>
                    </div>
                    <div className="login-preview-bubble">{pm.text}</div>
                  </div>
                ))}
                {previewTyping && (
                  <div className="login-preview-typing">
                    <span className="login-pip" style={{ background: previewTyping.color }} />
                    {previewTyping.name}
                    <span className="login-preview-typing-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
