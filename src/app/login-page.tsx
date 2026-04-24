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

/* ===== AGENT META ===== */

const AGENTS: Record<string, { role: string; color: string }> = {
  didi: { role: "the anchor", color: "var(--didi)" },
  boss: { role: "the judge", color: "var(--boss)" },
  fomo: { role: "the worrier", color: "var(--fomo)" },
  hype: { role: "the hype", color: "var(--hype)" },
};

/* ===== DIALOGUE POOL ===== */

type Beat = [string, string][];

const DIALOGUE: Record<string, Beat[]> = {
  greet: [
    [["didi", "welcome to the parliament. door\u2019s this way."]],
    [["didi", "oi. the council\u2019s waiting. let\u2019s get you in."]],
    [["didi", "hey. fill that out and we\u2019ll sort the rest."]],
    [["hype", "a challenger appears! \u2728"],
     ["didi", "fill in the form. we\u2019ll handle the drama."]],
    [["fomo", "ooh new person alert \u2014"],
     ["didi", "easy. just the form. go."]],
  ],
  deliberate: [
    [["fomo", "wait \u2014 is this one a serial overthinker or just a tuesday one?"],
     ["didi", "doesn\u2019t matter. ruling\u2019s the same. <strong>let them in.</strong>"],
     ["boss", "ruling: <em>approved.</em>"]],
    [["boss", "vote to seat the member."],
     ["hype", "aye! AYE! \u270b"],
     ["didi", "aye. obviously."]],
    [["fomo", "should we haze them first?"],
     ["didi", "no. we are not doing that."],
     ["boss", "<em>approved.</em> move on."]],
    [["didi", "checks out. running it."],
     ["hype", "welcome to the group chat that lives in your head \ud83e\udde0"],
     ["boss", "<em>approved.</em>"]],
  ],
  wrongPassword: [
    [["didi", "that\u2019s not the right password. try again."]],
    [["didi", "nope, wrong password."]],
    [["didi", "doesn\u2019t match. give it another shot."]],
  ],
  userNotFound: [
    [["didi", "can\u2019t find that username. sure you have an account?"]],
    [["didi", "no one by that name here. maybe try signing up?"]],
  ],
  usernameTaken: [
    [["didi", "that username\u2019s taken. pick another one."]],
    [["didi", "someone beat you to that one. try a different username."]],
  ],
};

/* ===== TYPES ===== */

interface Message {
  id: string;
  type: "agent" | "system";
  agent?: string;
  html: string;
}

/* ===== VALIDATION ===== */

function validateLoginForm(data: { username: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.username.trim().length < 3) errors.username = "at least 3 characters";
  else if (!/^[a-z0-9_.-]+$/.test(data.username.trim())) errors.username = "lowercase letters, numbers, _ . - only";
  if (data.password.length < 4) errors.password = "at least 4 characters";
  return errors;
}

function validateSignupForm(data: { name: string; city: string; age: string; username: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.name.trim().length < 1) errors.name = "we need a name";
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
  const [formData, setFormData] = useState({ name: "", city: "", age: "", username: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const [victory, setVictory] = useState<{ username: string; isNew: boolean } | null>(null);
  const [navigating, setNavigating] = useState(false);

  const bootedRef = useRef(false);
  const abortRef = useRef(0); // incremented on tab switch to cancel in-flight flows

  // Auto-scroll on messages or typing change
  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [messages, typingAgent, victory]);

  /* ===== CORE FUNCTIONS ===== */

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const playBeat = useCallback(async (beat: Beat, token: number) => {
    for (const [agent, line] of beat) {
      if (abortRef.current !== token) return;
      setTypingAgent(agent);
      await wait(900 + Math.random() * 800);
      if (abortRef.current !== token) return;
      setTypingAgent(null);
      addMessage({ id: uid(), type: "agent", agent, html: line });
      await wait(250);
    }
  }, [addMessage]);

  /* ===== BOOT ===== */

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // Check existing session
    try {
      const stored = localStorage.getItem("machax-user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.username) {
          router.push("/chat");
          return;
        }
      }
    } catch {
      // ignore
    }

    // Show greeting after delay
    const token = abortRef.current;
    (async () => {
      await wait(500);
      if (abortRef.current !== token) return;
      await playBeat(pick(DIALOGUE.greet), token);
    })();
  }, [playBeat, router]);

  /* ===== TAB SWITCH ===== */

  const handleTabSwitch = useCallback((tab: "login" | "signup") => {
    if (tab === activeTab && !victory) return;
    abortRef.current++;
    setActiveTab(tab);
    setFormData({ name: "", city: "", age: "", username: "", password: "" });
    setErrors({});
    setSubmitting(false);
    setMessages([]);
    setTypingAgent(null);
    setVictory(null);

    // New greeting
    const token = abortRef.current;
    (async () => {
      await wait(400);
      if (abortRef.current !== token) return;
      await playBeat(pick(DIALOGUE.greet), token);
    })();
  }, [activeTab, victory, playBeat]);

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
    setTypingAgent("didi");

    try {
      const result = await withTimeout(
        loginMutation({ username: formData.username.trim(), password: formData.password }),
        10000
      );

      if (abortRef.current !== token) return;
      setTypingAgent(null);

      if (result.success) {
        const name = result.name ?? formData.username.trim();
        addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 council deliberating \u00b7\u00b7\u00b7\u00b7\u00b7" });
        await wait(800);
        if (abortRef.current !== token) return;
        await playBeat(pick(DIALOGUE.deliberate), token);
        if (abortRef.current !== token) return;
        localStorage.setItem("machax-user", JSON.stringify({ username: formData.username.trim(), name }));
        setVictory({ username: formData.username.trim(), isNew: false });
      } else if (result.error === "not_found") {
        await playBeat(pick(DIALOGUE.userNotFound), token);
        setErrors({ username: "username not found" });
      } else {
        // wrong_password
        await playBeat(pick(DIALOGUE.wrongPassword), token);
        setErrors({ password: "wrong password" });
      }
    } catch {
      if (abortRef.current !== token) return;
      setTypingAgent(null);
      addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 connection hiccup. try again. \u00b7\u00b7\u00b7\u00b7\u00b7" });
    } finally {
      if (abortRef.current === token) {
        setSubmitting(false);
      }
    }
  }, [submitting, formData, loginMutation, addMessage, playBeat]);

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
    setTypingAgent("didi");

    try {
      const result = await withTimeout(
        signupMutation({
          username: formData.username.trim(),
          password: formData.password,
          name: formData.name.trim(),
          city: formData.city.trim(),
          age: parseInt(formData.age, 10),
        }),
        10000
      );

      if (abortRef.current !== token) return;
      setTypingAgent(null);

      if (result.success) {
        addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 council deliberating \u00b7\u00b7\u00b7\u00b7\u00b7" });
        await wait(800);
        if (abortRef.current !== token) return;
        await playBeat(pick(DIALOGUE.deliberate), token);
        if (abortRef.current !== token) return;
        localStorage.setItem("machax-user", JSON.stringify({ username: formData.username.trim(), name: formData.name.trim() }));
        setVictory({ username: formData.username.trim(), isNew: true });
      } else if (result.error === "username_taken") {
        await playBeat(pick(DIALOGUE.usernameTaken), token);
        setErrors({ username: "username already taken" });
      }
    } catch {
      if (abortRef.current !== token) return;
      setTypingAgent(null);
      addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 connection hiccup. try again. \u00b7\u00b7\u00b7\u00b7\u00b7" });
    } finally {
      if (abortRef.current === token) {
        setSubmitting(false);
      }
    }
  }, [submitting, formData, signupMutation, addMessage, playBeat]);

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

        {/* Form card */}
        <div className="login-stage">
          <div className="login-form-card">
            {activeTab === "login" ? (
              <form onSubmit={handleLoginSubmit} noValidate>
                <div className="login-field">
                  <label htmlFor="login-username">username</label>
                  <input
                    id="login-username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => updateField("username", e.target.value)}
                    placeholder="your username"
                    autoComplete="username"
                    maxLength={32}
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

          {/* Chat messages below form */}
          <div className="login-stream">
            {messages.map((msg) => {
              if (msg.type === "agent") {
                const agent = AGENTS[msg.agent!];
                return (
                  <div key={msg.id} className="login-msg login-msg--agent">
                    <div className="login-who">
                      <span className="login-pip" style={{ background: agent?.color }} />
                      <span className="login-who-name">{msg.agent}</span>
                      <span className="login-who-role">{agent?.role}</span>
                    </div>
                    <div
                      className="login-bubble login-bubble--agent"
                      dangerouslySetInnerHTML={{ __html: msg.html }}
                    />
                  </div>
                );
              }
              // system
              return (
                <div key={msg.id} className="login-msg login-msg--system">
                  <div className="login-bubble login-bubble--system">{msg.html}</div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingAgent && (
              <div className="login-typing">
                <span className="login-pip" style={{ background: AGENTS[typingAgent]?.color }} />
                {typingAgent} &middot; typing&hellip;
                <span className="login-typing-dots">
                  <span /><span /><span />
                </span>
              </div>
            )}

            {/* Victory card */}
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
        </div>
      </div>
    </div>
  );
}
