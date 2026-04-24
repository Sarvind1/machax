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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    [["didi", "oi. you tried to open a chat \u2014 but we don\u2019t know you yet."],
     ["didi", "i\u2019m <strong>didi</strong>. i keep things moving. let\u2019s get you in."]],
    [["boss", "halt. credentials, please."],
     ["didi", "don\u2019t mind him. he\u2019s like that with everyone."]],
    [["fomo", "ooh new person. wait \u2014 are you new or just\u2026 lurking new?"],
     ["didi", "either way, we\u2019ll sort it. let\u2019s go."]],
    [["hype", "a challenger appears! \u2728"],
     ["boss", "chill. we need a name first."]],
    [["didi", "welcome to the parliament. door\u2019s this way."],
     ["boss", "two seconds of paperwork. promise."]],
  ],
  branchPrompt: [
    [["boss", "existing member or new to the parliament?"]],
    [["didi", "have we met? or is this a first-time thing?"]],
    [["boss", "returning overthinker or fresh meat?"]],
  ],
  loginAskUser: [
    [["boss", "aight. <strong>username</strong> first."]],
    [["didi", "easy. what\u2019s your <strong>username</strong>?"]],
    [["boss", "name tag, please. <strong>username</strong>."]],
  ],
  loginAskPass: [
    [["boss", "mm. <em>{username}</em>. now the password."]],
    [["didi", "<em>{username}</em>, yep. drop the password."]],
    [["boss", "<em>{username}</em>. password next. no peeking."]],
  ],
  signupOpen: [
    [["hype", "ayy a fresh one! \ud83c\udf89 welcome welcome."],
     ["didi", "skip the fanfare. <strong>what should we call you?</strong> your actual name."]],
    [["didi", "alright, newbie. <strong>your name?</strong> first name is fine."]],
    [["fomo", "oh hi hi hi. ok \u2014 <strong>name first.</strong> what do people call you?"]],
    [["boss", "new intake. <strong>name.</strong>"],
     ["hype", "(he\u2019s efficient. you\u2019ll love it.)"]],
  ],
  signupAskCity: [
    [["didi", "hi <strong>{name}</strong>. which city are you spiraling from?"]],
    [["fomo", "nice to meet you <strong>{name}</strong>. <strong>city?</strong>"]],
    [["didi", "<strong>{name}</strong> \u2014 noted. where in the world are you?"]],
  ],
  signupAskAge: [
    [["fomo", "{city}? oof. and \u2014 how old are we being anxious at?"]],
    [["didi", "{city}, ok. <strong>age?</strong> just a number."]],
    [["fomo", "love that for you. <strong>age?</strong>"]],
  ],
  signupAskUsername: [
    [["boss", "ok. now pick a <strong>username</strong> \u2014 the council will use it to yell at you."]],
    [["didi", "pick a <strong>username</strong>. lowercase, no spaces, make it you."]],
    [["hype", "username time!! pick something the council can chant. \ud83d\udce3"]],
  ],
  signupAskPass: [
    [["hype", "<em>{username}</em>. iconic. \u2728"],
     ["boss", "last thing. set a password."]],
    [["boss", "<em>{username}</em>, locked in. password now."]],
    [["didi", "great handle. <strong>password</strong> \u2014 then we\u2019re done."]],
  ],
  deliberate: [
    [["fomo", "wait \u2014 is this one a serial overthinker or just a tuesday one?"],
     ["didi", "doesn\u2019t matter. ruling\u2019s the same. <strong>let them in.</strong>"],
     ["boss", "ruling: <em>approved.</em>"]],
    [["boss", "vote to seat the new member."],
     ["hype", "aye! AYE! \u270b"],
     ["didi", "aye. obviously."],
     ["boss", "motion passes."]],
    [["fomo", "should we haze them first?"],
     ["didi", "no. we are not doing that."],
     ["boss", "<em>approved.</em> move on."]],
    [["didi", "checks out. running it."],
     ["hype", "welcome to the group chat that lives in your head \ud83e\udde0"],
     ["boss", "<em>approved.</em>"]],
  ],
  forgot: [
    [["didi", "happens. the council forgets too."],
     ["boss", "reset link sent to the email on file. check spam."]],
    [["fomo", "oof. classic."],
     ["didi", "don\u2019t spiral. reset link is on its way."]],
    [["boss", "noted. reset link dispatched."],
     ["hype", "back in no time \u2728"]],
  ],
  usernameTaken: [
    [["boss", "that username\u2019s taken. try another."]],
    [["didi", "someone beat you to that one. pick another <strong>username</strong>."]],
  ],
  wrongPassword: [
    [["boss", "nope. wrong password."]],
    [["didi", "that\u2019s not it. try again."]],
  ],
  userNotFound: [
    [["boss", "no one by that name here."]],
    [["didi", "hmm, can\u2019t find that username. sure you have an account?"]],
  ],
};

/* ===== TYPES ===== */

interface Message {
  id: string;
  type: "agent" | "user" | "system";
  agent?: string;
  html: string;
}

interface InputConfig {
  prompt: string;
  placeholder: string;
  type: "text" | "password";
  validate: (v: string) => true | string;
  onAnswer: (v: string) => void;
}

interface FlowState {
  branch: null | "login" | "signup";
  name: string | null;
  city: string | null;
  age: number | null;
  username: string | null;
  password: string | null;
}

/* ===== COMPONENT ===== */

export default function LoginPage() {
  const router = useRouter();
  const signup = useMutation(api.users.signup);
  const login = useMutation(api.users.login);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chips, setChips] = useState<{ label: string; value: string }[] | null>(null);
  const [inputConfig, setInputConfig] = useState<InputConfig | null>(null);
  const [composerLocked, setComposerLocked] = useState(true);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<FlowState>({
    branch: null, name: null, city: null, age: null, username: null, password: null,
  });
  const [victory, setVictory] = useState<{ username: string; isNew: boolean } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [shaking, setShaking] = useState(false);
  const [forgotActive, setForgotActive] = useState(false);

  const flowRef = useRef(flowState);
  flowRef.current = flowState;

  const inputRef = useRef<HTMLInputElement>(null);
  const bootedRef = useRef(false);
  // Ref to allow async flow functions to resolve when user submits input
  const inputResolverRef = useRef<((v: string) => void) | null>(null);

  // Auto-scroll on messages or typing change
  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [messages, typingAgent, chips, victory]);

  // Focus input when config changes
  useEffect(() => {
    if (inputConfig) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputConfig]);

  /* ===== CORE FUNCTIONS ===== */

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const interpolate = useCallback((text: string): string => {
    const s = flowRef.current;
    return text
      .replace(/\{name\}/g, s.name ?? "")
      .replace(/\{city\}/g, s.city ?? "")
      .replace(/\{username\}/g, s.username ?? "");
  }, []);

  const playBeat = useCallback(async (beat: Beat) => {
    for (const [agent, line] of beat) {
      setTypingAgent(agent);
      await wait(900 + Math.random() * 800);
      setTypingAgent(null);
      addMessage({ id: uid(), type: "agent", agent, html: interpolate(line) });
      await wait(250);
    }
  }, [addMessage, interpolate]);

  // Promise-based input collection
  const askInput = useCallback((config: Omit<InputConfig, "onAnswer">): Promise<string> => {
    return new Promise((resolve) => {
      inputResolverRef.current = resolve;
      setInputConfig({
        ...config,
        onAnswer: (v: string) => {
          inputResolverRef.current = null;
          resolve(v);
        },
      });
      setComposerLocked(false);
      setInputValue("");
    });
  }, []);

  const lockComposer = useCallback(() => {
    setComposerLocked(true);
    setInputConfig(null);
  }, []);

  const addUserMessage = useCallback((text: string, maskPassword = false) => {
    const display = maskPassword ? "\u2022".repeat(text.length) : escapeHtml(text);
    addMessage({ id: uid(), type: "user", html: display });
  }, [addMessage]);

  /* ===== FLOWS ===== */

  const deliberateAndFinish = useCallback(async (username: string, isNew: boolean) => {
    lockComposer();
    addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 council deliberating \u00b7\u00b7\u00b7\u00b7\u00b7" });
    await wait(1400);
    await playBeat(pick(DIALOGUE.deliberate));
    setVictory({ username, isNew });
    localStorage.setItem("machax-user", JSON.stringify({ username, name: flowRef.current.name ?? username }));
  }, [lockComposer, addMessage, playBeat]);

  const runLogin = useCallback(async () => {
    setFlowState((s) => ({ ...s, branch: "login" }));

    // Ask username
    await playBeat(pick(DIALOGUE.loginAskUser));
    let username: string;
    // loop for retry on not_found
    while (true) {
      username = await askInput({
        prompt: "your username",
        placeholder: "username",
        type: "text",
        validate: (v) => (v.trim().length >= 2 ? true : "too short"),
      });
      addUserMessage(username);
      lockComposer();
      setFlowState((s) => ({ ...s, username }));
      break;
    }

    // Ask password
    await playBeat(pick(DIALOGUE.loginAskPass));
    setForgotActive(true);

    while (true) {
      const password = await askInput({
        prompt: "password",
        placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
        type: "password",
        validate: (v) => (v.length >= 1 ? true : "enter your password"),
      });
      addUserMessage(password, true);
      lockComposer();
      setForgotActive(false);
      setFlowState((s) => ({ ...s, password }));

      // Call Convex
      setTypingAgent("boss");
      await wait(600);
      try {
        const result = await login({ username, password });
        setTypingAgent(null);
        if (result.success) {
          setFlowState((s) => ({ ...s, name: result.name ?? username }));
          await deliberateAndFinish(username, false);
          return;
        } else if (result.error === "not_found") {
          await playBeat(pick(DIALOGUE.userNotFound));
          // Re-ask username from scratch
          await playBeat(pick(DIALOGUE.loginAskUser));
          const newUsername = await askInput({
            prompt: "your username",
            placeholder: "username",
            type: "text",
            validate: (v) => (v.trim().length >= 2 ? true : "too short"),
          });
          addUserMessage(newUsername);
          lockComposer();
          username = newUsername;
          setFlowState((s) => ({ ...s, username: newUsername }));
          await playBeat(pick(DIALOGUE.loginAskPass));
          setForgotActive(true);
          continue; // re-ask password
        } else {
          // wrong_password
          await playBeat(pick(DIALOGUE.wrongPassword));
          setForgotActive(true);
          continue; // re-ask password
        }
      } catch {
        setTypingAgent(null);
        addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 connection hiccup. try again. \u00b7\u00b7\u00b7\u00b7\u00b7" });
        setForgotActive(true);
        continue;
      }
    }
  }, [playBeat, askInput, addUserMessage, lockComposer, login, deliberateAndFinish, addMessage]);

  const runSignup = useCallback(async () => {
    setFlowState((s) => ({ ...s, branch: "signup" }));

    // Name
    await playBeat(pick(DIALOGUE.signupOpen));
    const name = await askInput({
      prompt: "your name",
      placeholder: "first name is fine",
      type: "text",
      validate: (v) => (v.trim().length >= 1 ? true : "we need a name"),
    });
    addUserMessage(name);
    lockComposer();
    setFlowState((s) => ({ ...s, name }));

    // City
    await playBeat(pick(DIALOGUE.signupAskCity));
    const city = await askInput({
      prompt: "city",
      placeholder: "e.g. bengaluru",
      type: "text",
      validate: (v) => (v.trim().length >= 1 ? true : "city?"),
    });
    addUserMessage(city);
    lockComposer();
    setFlowState((s) => ({ ...s, city }));

    // Age
    await playBeat(pick(DIALOGUE.signupAskAge));
    const ageStr = await askInput({
      prompt: "age",
      placeholder: "just a number",
      type: "text",
      validate: (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 13 || n > 120) return "enter a valid age";
        return true;
      },
    });
    addUserMessage(ageStr);
    lockComposer();
    const age = parseInt(ageStr, 10);
    setFlowState((s) => ({ ...s, age }));

    // Username (loop for taken)
    await playBeat(pick(DIALOGUE.signupAskUsername));
    let username: string;
    while (true) {
      username = await askInput({
        prompt: "pick a username",
        placeholder: "lowercase, no spaces",
        type: "text",
        validate: (v) => {
          if (v.trim().length < 3) return "at least 3 chars";
          if (/\s/.test(v)) return "no spaces";
          if (!/^[a-z0-9_.-]+$/.test(v)) return "lowercase letters, numbers, _ . - only";
          return true;
        },
      });
      addUserMessage(username);
      lockComposer();
      setFlowState((s) => ({ ...s, username }));

      // Check availability early if we already tried and it was taken — just continue to password
      break;
    }

    // Password
    await playBeat(pick(DIALOGUE.signupAskPass));
    while (true) {
      const password = await askInput({
        prompt: "set a password",
        placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
        type: "password",
        validate: (v) => (v.length >= 4 ? true : "at least 4 characters"),
      });
      addUserMessage(password, true);
      lockComposer();
      setFlowState((s) => ({ ...s, password }));

      // Call Convex
      setTypingAgent("didi");
      await wait(600);
      try {
        const result = await signup({ username, password, name, city, age });
        setTypingAgent(null);
        if (result.success) {
          await deliberateAndFinish(username, true);
          return;
        } else if (result.error === "username_taken") {
          await playBeat(pick(DIALOGUE.usernameTaken));
          // Re-ask username
          const newUsername = await askInput({
            prompt: "pick a username",
            placeholder: "lowercase, no spaces",
            type: "text",
            validate: (v) => {
              if (v.trim().length < 3) return "at least 3 chars";
              if (/\s/.test(v)) return "no spaces";
              if (!/^[a-z0-9_.-]+$/.test(v)) return "lowercase letters, numbers, _ . - only";
              return true;
            },
          });
          addUserMessage(newUsername);
          lockComposer();
          username = newUsername;
          setFlowState((s) => ({ ...s, username: newUsername }));
          await playBeat(pick(DIALOGUE.signupAskPass));
          continue; // re-ask password
        }
      } catch {
        setTypingAgent(null);
        addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 connection hiccup. try again. \u00b7\u00b7\u00b7\u00b7\u00b7" });
        continue;
      }
    }
  }, [playBeat, askInput, addUserMessage, lockComposer, signup, deliberateAndFinish, addMessage]);

  const handleBranch = useCallback(async (value: string) => {
    setChips(null);
    addUserMessage(value === "login" ? "i have an account" : "i\u2019m new here");

    if (value === "login") {
      await runLogin();
    } else {
      await runSignup();
    }
  }, [addUserMessage, runLogin, runSignup]);

  /* ===== BOOT ===== */

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      await wait(400);
      await playBeat(pick(DIALOGUE.greet));
      await playBeat(pick(DIALOGUE.branchPrompt));
      setChips([
        { label: "i have an account", value: "login" },
        { label: "i\u2019m new here", value: "signup" },
      ]);
    })();
  }, [playBeat]);

  /* ===== FORM SUBMIT ===== */

  const handleSubmit = useCallback(() => {
    if (!inputConfig || composerLocked) return;
    const val = inputValue.trim();
    const result = inputConfig.validate(val);
    if (result !== true) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }
    inputConfig.onAnswer(val);
  }, [inputConfig, composerLocked, inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  /* ===== FORGOT PASSWORD ===== */

  const handleForgot = useCallback(async () => {
    if (!forgotActive) return;
    setForgotActive(false);
    lockComposer();
    addUserMessage("i forgot my password \ud83e\udee0");
    await playBeat(pick(DIALOGUE.forgot));
    addMessage({ id: uid(), type: "system", html: "\u00b7\u00b7\u00b7\u00b7\u00b7 reset link sent (demo only) \u00b7\u00b7\u00b7\u00b7\u00b7" });
  }, [forgotActive, lockComposer, addUserMessage, playBeat, addMessage]);

  /* ===== OPEN CHAT ===== */

  const handleOpenChat = useCallback(() => {
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
        </div>

        {/* Message stream */}
        <div className="login-stage">
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
              if (msg.type === "user") {
                return (
                  <div key={msg.id} className="login-msg login-msg--user">
                    <div
                      className="login-bubble login-bubble--user"
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
                <span className="login-pip" style={{ background: AGENTS[typingAgent]?.color, width: 6, height: 6, borderRadius: "50%", display: "inline-block" }} />
                {typingAgent} &middot; typing&hellip;
                <span className="login-typing-dots">
                  <span /><span /><span />
                </span>
              </div>
            )}

            {/* Chips */}
            {chips && (
              <div className="login-chips">
                {chips.map((c) => (
                  <button
                    key={c.value}
                    className="login-chip"
                    onClick={() => handleBranch(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {/* Victory card */}
            {victory && (
              <div className="login-victory">
                <h2>{victory.isNew ? "welcome in" : "welcome back"}, <em>{victory.username}</em>.</h2>
                <p>the council is seated. whenever you&apos;re ready &mdash; dump the messy thought.</p>
                <button className="login-victory-btn" onClick={handleOpenChat}>
                  open chat &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="login-composer-wrap">
        <div className={`login-composer-inner ${composerLocked ? "login-composer-locked" : ""}`}>
          {inputConfig && (
            <div className="login-prompt">{inputConfig.prompt}</div>
          )}
          <div className={`login-composer ${shaking ? "login-shake" : ""}`}>
            <input
              ref={inputRef}
              type={inputConfig?.type ?? "text"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputConfig?.placeholder ?? "waiting for the council..."}
              disabled={composerLocked}
              autoComplete="off"
            />
            <button
              className="login-composer-send"
              onClick={handleSubmit}
              disabled={composerLocked || !inputValue.trim()}
              aria-label="Send"
            >
              &uarr;
            </button>
          </div>
          <div className="login-footer">
            <span><kbd>enter</kbd> to send</span>
            <button
              className="login-forgot"
              disabled={!forgotActive}
              onClick={handleForgot}
            >
              forgot password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
