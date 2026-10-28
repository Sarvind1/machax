"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Capacitor } from "@capacitor/core";
import { AuthRequired, authedFetch, getStoredUser } from "@/lib/api";
import { PaymentError, buyTopupWeb } from "@/lib/razorpay-checkout";
import { signOut } from "@/lib/firebase";
import type { CreditSummary } from "@/lib/credits";
import { logEvent } from "@/lib/analytics";
import { logActivated } from "@/lib/meta-events";
import { api } from "../../../convex/_generated/api";

function useSafeQuery<T>(query: any, args?: any): T | null {
  try {
    const result = useQuery(query, args);
    return result ?? null;
  } catch {
    return null;
  }
}
import type { Id } from "../../../convex/_generated/dataModel";
import type { ChatMessage as ChatMessageType, Decision } from "@/lib/types";
import { FRIENDS, FRIENDS_BY_ID, STARTERS, selectPod, type Friend } from "@/lib/friends";

type ChatMessageWithReply = ChatMessageType & {
  replyTo?: string;
  mediaType?: "gif" | "sticker" | "meme";
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaAltText?: string;
};

import ChatMessage from "./components/chat-message";
import ChatComposer from "./components/chat-composer";
import DecisionPanel from "./components/decision-panel";
import FriendPill from "./components/friend-pill";
import TypingIndicator from "./components/typing-indicator";
import CreditPill from "./components/credit-pill";
import RechargeSheet from "./components/recharge-sheet";
import "./chat.css";

type ConversationId = Id<"conversations">;

const MODES = [
  { id: "late-night", label: "late night", desc: "soft, 2am energy" },
  { id: "hot-take", label: "hot takes", desc: "spicy, fun" },
  { id: "deep-dive", label: "deep dive", desc: "fully unpacked" },
  { id: "devils-advocate", label: "devil's advocate", desc: "pushback" },
  { id: "emotional", label: "emotional support", desc: "mostly listening" },
  { id: "roast", label: "lovingly roast", desc: "tease, gently" },
  { id: "hype", label: "hype mode", desc: "cheerleader" },
  { id: "debate-club", label: "debate club", desc: "back-and-forth" },
];

const PACING_OPTIONS = ["snappy", "natural", "slow"];
const ENERGY_OPTIONS = ["low", "settled", "up"];

// Tail of a /api/chat stream: the balance after this message was charged.
type CreditEvent = {
  balanceMicros: number;
  messagesLeft: number;
  costMicros: number;
  topupMessages: number;
};

// The event has no avgCostMicros. Carry over the last known one; before any
// summary has loaded, fall back to balance / messagesLeft (0 when unknowable).
// Nothing on the client reads it today, it only keeps the CreditSummary shape.
function creditFromEvent(e: CreditEvent, prev: CreditSummary | null): CreditSummary {
  return {
    balanceMicros: e.balanceMicros,
    messagesLeft: e.messagesLeft,
    topupMessages: e.topupMessages,
    avgCostMicros:
      prev?.avgCostMicros ?? (e.messagesLeft > 0 ? Math.round(e.balanceMicros / e.messagesLeft) : 0),
  };
}

// No usable Firebase session: either nobody is signed in, or this build has
// no Firebase web config (same check the login page uses).
function isSignedOut(err: unknown): boolean {
  return err instanceof AuthRequired || (err instanceof Error && err.message.includes("missing web config"));
}

const TOAST_MS = 3000;

export default function ChatPage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const leavingRef = useRef(false);

  // Session is gone or rejected. Sign out first (clears machax-user), so /login
  // and / don't bounce straight back here.
  const goToLogin = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setIsAuthed(false);
    try {
      await signOut();
    } catch (err) {
      console.error("Sign-out before login redirect failed:", err);
    }
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!getStoredUser()) {
      router.push("/login");
      return;
    }
    setIsAuthed(true);
    // Also proves the Firebase session is live: no token or a 401 sends us to /login.
    (async () => {
      try {
        const res = await authedFetch("/api/credits");
        if (res.status === 401) return goToLogin();
        if (!res.ok) throw new Error(`credits request failed: ${res.status}`);
        setCredits((await res.json()) as CreditSummary);
      } catch (err) {
        if (isSignedOut(err)) return goToLogin();
        console.error("Failed to load credits:", err);
      }
    })();
  }, [router, goToLogin]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // userName for display (can be display name)
  const userName = useMemo(() => {
    const user = getStoredUser();
    return user?.name || user?.username || "friend";
  }, []);

  // settingsUsername for Convex queries (must match what /configure saves under)
  const settingsUsername = useMemo(() => getStoredUser()?.username ?? null, []);

  // Load user's saved settings from Convex (pod size, character overrides, etc.)
  const userSettings = useQuery(api.settings.get, settingsUsername ? { username: settingsUsername } : "skip");

  const [activeConversation, setActiveConversation] = useState<ConversationId | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithReply[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [pod, setPod] = useState<Friend[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [typingAgents, setTypingAgents] = useState<string[]>([]);
  const [mobileDecisionOpen, setMobileDecisionOpen] = useState(false);
  const [joinedAgents, setJoinedAgents] = useState<string[]>([]);
  const [lurkingAgents, setLurkingAgents] = useState<string[]>([]);
  const [isWindingDown, setIsWindingDown] = useState(false);
  const [activeAgentIds, setActiveAgentIds] = useState<Set<string>>(new Set());

  // Session mood state
  const [moodOpen, setMoodOpen] = useState(false);
  const [sessionModes, setSessionModes] = useState<string[]>([]);
  const [sessionPacing, setSessionPacing] = useState<string>("natural");
  const [sessionEnergy, setSessionEnergy] = useState<string>("settled");
  const moodPanelRef = useRef<HTMLDivElement>(null);
  const moodTriggerRef = useRef<HTMLButtonElement>(null);

  // Load session mood from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("machax-session-mood");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSessionModes(parsed.modes || []);
        setSessionPacing(parsed.pacing || "natural");
        setSessionEnergy(parsed.energy || "settled");
      }
    } catch {}
  }, []);

  // Save session mood to localStorage
  useEffect(() => {
    localStorage.setItem("machax-session-mood", JSON.stringify({
      modes: sessionModes, pacing: sessionPacing, energy: sessionEnergy,
    }));
  }, [sessionModes, sessionPacing, sessionEnergy]);

  // Close mood panel on click outside
  useEffect(() => {
    if (!moodOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moodPanelRef.current && !moodPanelRef.current.contains(e.target as Node) &&
        moodTriggerRef.current && !moodTriggerRef.current.contains(e.target as Node)
      ) {
        setMoodOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moodOpen]);

  const toggleMode = useCallback((modeId: string) => {
    logEvent("mood_changed", { mood_type: "mode", mood: modeId });
    setSessionModes(prev =>
      prev.includes(modeId) ? prev.filter(m => m !== modeId) : [...prev, modeId]
    );
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  const conversations = useSafeQuery<any[]>(
    api.conversations.list,
    settingsUsername ? { username: settingsUsername } : "skip"
  ) ?? [];
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.messages.send);
  const upsertDecision = useMutation(api.decisions.upsert);
  const selectDecision = useMutation(api.decisions.select);
  const createReport = useMutation(api.reports.create);

  // Load messages from Convex when conversation changes
  const convexMessages = useSafeQuery<any[]>(
    api.messages.list,
    activeConversation && settingsUsername ? { conversationId: activeConversation, username: settingsUsername } : "skip"
  );
  const convexDecision = useSafeQuery<any>(
    api.decisions.get,
    activeConversation && settingsUsername ? { conversationId: activeConversation, username: settingsUsername } : "skip"
  );

  useEffect(() => {
    if (convexMessages && !isLoading && !isStreamingRef.current) {
      setMessages(
        convexMessages.map((m) => ({
          id: m._id,
          conversationId: m.conversationId as string,
          from: m.from,
          mediaType: m.mediaType,
          mediaUrl: m.mediaUrl,
          mediaThumbnailUrl: m.mediaThumbnailUrl,
          mediaAltText: m.mediaAltText,
          replyTo: m.replyTo,
          text: m.text,
          timestamp: m.timestamp,
        }))
      );
    }
  }, [convexMessages, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      if (convexDecision) {
        setDecision({
          question: convexDecision.question,
          options: convexDecision.options,
        });
      } else {
        setDecision(null);
      }
    }
  }, [convexDecision, isLoading]);

  // Auto-scroll to bottom only if user is near the bottom
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingAgents]);

  // Safety timeout: if isLoading stays true for 90s, force-reset
  useEffect(() => {
    if (!isLoading) return;
    const timeout = setTimeout(() => {
      console.warn("Safety timeout: force-resetting isLoading after 90s");
      setIsLoading(false);
      isStreamingRef.current = false;
      setTypingAgents([]);
    }, 90_000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  const streamChat = useCallback(
    async (
      message: string,
      convoId: ConversationId,
      podIds: string[],
      history: { from: string; text: string }[]
    ) => {
      setIsLoading(true);
      isStreamingRef.current = true;
      try {
        const response = await authedFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convoId,
            message,
            podFriendIds: podIds,
            history,
            userName,
            sessionMood: {
              modes: sessionModes,
              pacing: sessionPacing,
              energy: sessionEnergy,
            },
            characterOverrides: userSettings?.characterOverrides || null,
            conversationDepth: userSettings?.conversationDepth || "normal",
            userEngagementFrequency: userSettings?.userEngagementFrequency ?? 0.4,
          }),
        });

        if (response.status === 401) {
          await goToLogin();
          return;
        }
        if (response.status === 402) {
          const body = (await response.json().catch(() => null)) as { credits?: CreditSummary } | null;
          if (body?.credits) setCredits(body.credits);
          setInput((current) => current || message);
          setRechargeOpen(true);
          return;
        }
        if (response.status === 409) {
          setInput((current) => current || message);
          setToast("still replying, give it a sec");
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error("Chat API request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.joined) {
                const friend = FRIENDS_BY_ID[data.joined];
                if (friend) {
                  setPod(prev => prev.some(f => f.id === data.joined) ? prev : [...prev, friend]);
                }
                setJoinedAgents(prev => [...prev, data.joined]);
                // Silent join — no system message
              }

              if (data.lurking) {
                setLurkingAgents(prev =>
                  prev.includes(data.lurking) ? prev : [...prev, data.lurking]
                );
              }

              if (data.windingDown) {
                setIsWindingDown(true);
              }

              if (data.from && data.text) {
                // Track agents that have actually spoken
                if (data.from !== "user") {
                  setActiveAgentIds(prev => new Set([...prev, data.from]));
                }
                // Remove this friend from typing list
                setTypingAgents((prev) => prev.filter((id) => id !== data.from));
                const newMsg: ChatMessageWithReply = {
                  id: `${data.from}-${Date.now()}-${Math.random()}`,
                  conversationId: convoId as string,
                  from: data.from,
                  text: data.text,
                  replyTo: data.replyTo || undefined,
                  mediaType: data.mediaType,
                  mediaUrl: data.mediaUrl,
                  mediaThumbnailUrl: data.mediaThumbnailUrl,
                  mediaAltText: data.mediaAltText,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, newMsg]);
                if (data.mediaType) logEvent("gif_received", { media_type: data.mediaType });

                // Persist to Convex
                try {
                  await sendMessage({
                    conversationId: convoId,
                    from: data.from,
                    text: data.text,
                    username: settingsUsername!,
                    ...(data.mediaType ? { mediaType: data.mediaType } : {}),
                    ...(data.mediaUrl ? { mediaUrl: data.mediaUrl } : {}),
                    ...(data.mediaThumbnailUrl ? { mediaThumbnailUrl: data.mediaThumbnailUrl } : {}),
                    ...(data.mediaAltText ? { mediaAltText: data.mediaAltText } : {}),
                    ...(data.replyTo ? { replyTo: data.replyTo } : {}),
                  });
                } catch {
                  // Convex save failed — message still shows in UI
                }
              }

              if (data.typing) {
                setTypingAgents((prev) =>
                  prev.includes(data.typing) ? prev : [...prev, data.typing]
                );
              }

              if (data.decision) {
                setDecision(data.decision);
                try {
                  await upsertDecision({
                    conversationId: convoId,
                    question: data.decision.question,
                    options: data.decision.options,
                    username: settingsUsername!,
                  });
                } catch {
                  // Convex save failed — decision still shows in UI
                }
              }

              if (data.credit && typeof data.credit.messagesLeft === "number") {
                const event = data.credit as CreditEvent;
                setCredits((prev) => creditFromEvent(event, prev));
              }

              if (data.done) {
                setTypingAgents([]);
                setIsLoading(false);
                isStreamingRef.current = false;
              }

              // Trace is saved server-side in the chat API route
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if (isSignedOut(err)) {
          await goToLogin();
          return;
        }
        console.error("Chat stream error:", err);
      } finally {
        isStreamingRef.current = false;
        setIsLoading(false);
        setTypingAgents([]);
      }
    },
    [sendMessage, upsertDecision, userName, sessionModes, sessionPacing, sessionEnergy, userSettings, settingsUsername, goToLogin]
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Known to be out of credit: offer a top-up instead of sending. The text stays in the box.
    if (credits?.messagesLeft === 0) {
      setRechargeOpen(true);
      return;
    }

    setInput("");

    // Guard against Convex reactive query overwriting local state during the
    // submit flow.  The sendMessage mutation triggers the convexMessages query
    // to update, and the useEffect that syncs convexMessages → setMessages
    // checks isStreamingRef.  We must set it *before* any Convex mutation so
    // the guard is active when the reactive query fires.
    isStreamingRef.current = true;

    if (!activeConversation) {
      // First message — create conversation
      const tag = STARTERS.find((s) => s.text === text)?.tag ?? "life";

      let podIds: string[];
      if (userSettings?.characterOverrides) {
        try {
          const overrides = JSON.parse(userSettings.characterOverrides);
          const activeIds = Object.entries(overrides)
            .filter(([, v]: [string, any]) => (v as any).active !== false)
            .map(([id]) => id);

          if (activeIds.length > 0) {
            const maxPod = userSettings.podSize || 7;
            podIds = activeIds.slice(0, maxPod);
          } else {
            const maxPod = userSettings.podSize || 7;
            podIds = selectPod([tag], maxPod).map(f => f.id);
          }
        } catch {
          podIds = selectPod([tag], userSettings?.podSize || 7).map(f => f.id);
        }
      } else {
        podIds = selectPod([tag], userSettings?.podSize || 7).map(f => f.id);
      }

      const selectedPod = podIds.map(id => FRIENDS_BY_ID[id]).filter(Boolean);
      setPod(selectedPod);

      try {
        const convoId = await createConversation({
          title: text.slice(0, 60),
          tag,
          podFriendIds: podIds,
          sessionMood: JSON.stringify({ modes: sessionModes, pacing: sessionPacing, energy: sessionEnergy }),
          username: settingsUsername || undefined,
        });

        setActiveConversation(convoId);
        logEvent("dilemma_posted", { pod_size: podIds.length, topic: tag });

        const userMsg: ChatMessageType = {
          id: `user-${Date.now()}`,
          conversationId: convoId as string,
          from: "user",
          text,
          timestamp: Date.now(),
        };
        setMessages([userMsg]);

        await sendMessage({
          conversationId: convoId,
          from: "user",
          text,
          username: settingsUsername!,
        });

        await streamChat(text, convoId, podIds, []);
      } catch (err) {
        console.error("Failed to create conversation:", err);
        isStreamingRef.current = false;
      }
    } else {
      // Subsequent message
      const userMsg: ChatMessageType = {
        id: `user-${Date.now()}`,
        conversationId: activeConversation as string,
        from: "user",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        await sendMessage({
          conversationId: activeConversation,
          from: "user",
          text,
          username: settingsUsername!,
        });
      } catch {
        // continue even if Convex fails
      }

      const history = messages.map((m) => ({ from: m.from, text: m.text }));

      try {
        await streamChat(
          text,
          activeConversation,
          pod.map((f) => f.id),
          history
        );
      } catch (err) {
        console.error("Stream failed on subsequent message:", err);
        isStreamingRef.current = false;
        setIsLoading(false);
        setTypingAgents([]);
      }
    }
  }, [input, isLoading, activeConversation, pod, messages, createConversation, sendMessage, streamChat, sessionModes, sessionPacing, sessionEnergy, userSettings, settingsUsername, credits]);

  const handleStarterClick = (starterText: string) => {
    setInput(starterText);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages([]);
    setDecision(null);
    setPod([]);
    setInput("");
    setTypingAgents([]);
    setIsLoading(false);
    setJoinedAgents([]);
    setLurkingAgents([]);
    setIsWindingDown(false);
    setActiveAgentIds(new Set());
  };

  const handleLoadConversation = (convoId: ConversationId, convo: { podFriendIds: string[] }) => {
    setActiveConversation(convoId);
    setPod(convo.podFriendIds.map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
    setDecision(null);
  };

  const handleDecisionSelect = async (optionId: string) => {
    if (!activeConversation || !settingsUsername) return;
    try {
      await selectDecision({
        conversationId: activeConversation,
        optionId,
        username: settingsUsername,
      });
      logEvent("decision_picked", { option_count: decision?.options.length ?? 0 });
      logActivated(settingsUsername);
      router.push("/decisions");
    } catch (err) {
      console.error("Failed to select decision:", err);
    }
  };

  const friendsRecord = Object.fromEntries(
    FRIENDS.map((f) => [f.id, { name: f.name, color: f.color }])
  );

  const openRecharge = () => setRechargeOpen(true);
  const closeRecharge = () => {
    setRechargeOpen(false);
    setBuyError(null);
  };

  const handleBuy = async () => {
    // Native builds pay through Play Billing (wired in a later task).
    if (Capacitor.isNativePlatform() || buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const { credits: next } = await buyTopupWeb();
      setCredits(next);
      setRechargeOpen(false);
      setToast(`credit added · ~${next.messagesLeft} messages`);
    } catch (err) {
      if (err instanceof AuthRequired) {
        await goToLogin();
        return;
      }
      setBuyError(err instanceof PaymentError ? err.message : "payment didn't go through");
    } finally {
      setBuying(false);
    }
  };

  // Shared by the landing and chat views.
  const overlays = (
    <>
      {toast && <div className="chat-toast" role="status">{toast}</div>}
      <RechargeSheet
        open={rechargeOpen}
        credits={credits}
        onClose={closeRecharge}
        onBuy={handleBuy}
        busy={buying}
        error={buyError}
      />
    </>
  );

  if (!isAuthed) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F4F1E8",
        color: "#5A554A",
        fontFamily: "var(--font-body), system-ui, sans-serif",
      }}>
        <p>redirecting to login...</p>
      </div>
    );
  }

  // Landing state
  if (!activeConversation && messages.length === 0) {
    return (
      <div className="chat-page">
        {/* Sidebar */}
        <aside className="chat-sidebar">
          <a href="/" className="chat-sidebar-logo">
            macha<em>X</em>
          </a>

          {conversations.length > 0 && (
            <>
              <div className="chat-sidebar-section">recent</div>
              <div className="chat-history-list">
                {conversations.map((c) => (
                  <div
                    key={c._id}
                    className="chat-history-item"
                    onClick={() => handleLoadConversation(c._id, c)}
                  >
                    {c.title}
                  </div>
                ))}
              </div>
            </>
          )}

          <button className="chat-new-btn" onClick={handleNewChat}>
            + new chat
          </button>

          <a href="/configure" style={{
            display: "block", padding: "10px 16px", fontSize: 12,
            color: "var(--ink-faint)", fontFamily: "var(--font-mono)",
            textDecoration: "none", letterSpacing: "0.06em",
          }}>
            ⚙ configure pod
          </a>
          <div className="chat-sidebar-legal">
            <a href="/privacy">privacy</a>
            <a href="/delete-account">delete account</a>
          </div>
        </aside>

        {/* Landing center */}
        <div className="chat-landing">
          <div className="chat-landing-credit">
            <CreditPill credits={credits} onClick={openRecharge} />
          </div>
          <h1 className="chat-landing-title">what&apos;s on your mind?</h1>
          <p className="chat-landing-sub">
            dump your messiest thought. your council of AI friends will hash it out.
          </p>

          <div className="chat-mood-landing">
            <button
              ref={moodTriggerRef}
              className="chat-mood-trigger"
              onClick={() => setMoodOpen(!moodOpen)}
              title="Session mood"
            >
              <span className="chat-mood-dot" /> set the mood
            </button>
            {sessionModes.length > 0 && (
              <div className="chat-mood-active-pills">
                {sessionModes.map(m => (
                  <span key={m} className="chat-mood-active-pill">{m.replace("-", " ")}</span>
                ))}
              </div>
            )}

            {moodOpen && (
              <div className="chat-mood-panel" ref={moodPanelRef}>
                <div className="chat-mood-section">
                  <div className="chat-mood-label">modes</div>
                  <div className="chat-mood-pills">
                    {MODES.map(mode => (
                      <button
                        key={mode.id}
                        className={`chat-mood-pill ${sessionModes.includes(mode.id) ? "chat-mood-pill--active" : ""}`}
                        onClick={() => toggleMode(mode.id)}
                        title={mode.desc}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chat-mood-section">
                  <div className="chat-mood-label">pacing</div>
                  <div className="chat-mood-segmented">
                    {PACING_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        className={`chat-mood-segment ${sessionPacing === opt ? "chat-mood-segment--active" : ""}`}
                        onClick={() => { setSessionPacing(opt); logEvent("mood_changed", { mood_type: "pacing", mood: opt }); }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chat-mood-section">
                  <div className="chat-mood-label">energy</div>
                  <div className="chat-mood-segmented">
                    {ENERGY_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        className={`chat-mood-segment ${sessionEnergy === opt ? "chat-mood-segment--active" : ""}`}
                        onClick={() => { setSessionEnergy(opt); logEvent("mood_changed", { mood_type: "energy", mood: opt }); }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="chat-mood-done" onClick={() => setMoodOpen(false)}>
                  done
                </button>
              </div>
            )}
          </div>

          <div className="chat-landing-composer">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              disabled={isLoading}
              placeholder="type it out..."
            />
          </div>

          <div className="chat-landing-chips">
            {STARTERS.map((s) => (
              <button
                key={s.tag}
                className="chat-landing-chip"
                onClick={() => handleStarterClick(s.text)}
              >
                <span>{s.chip}</span>
                {s.text}
              </button>
            ))}
          </div>

        </div>
        {overlays}
      </div>
    );
  }

  // Chat state
  return (
    <div className="chat-page">
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <a href="/" className="chat-sidebar-logo">
          macha<em>X</em>
        </a>

        {pod.length > 0 && (
          <>
            <div className="chat-sidebar-section">your pod</div>
            <div className="chat-pod-list">
              {pod.map((f) => {
                const isActive = activeAgentIds.has(f.id);
                const isLurking = lurkingAgents.includes(f.id);
                return (
                  <div key={f.id} className={`friend-pill-presence ${isActive ? 'active' : isLurking ? 'lurking' : 'joined'}`}>
                    <span className="presence-dot-small" />
                    <span className="friend-pill-avatar" style={{ background: f.color }}>{f.name[0]}</span>
                    <span>{f.name.toLowerCase()}</span>
                  </div>
                );
              })}
              {lurkingAgents
                .filter(id => !pod.some(f => f.id === id))
                .map(id => {
                  const f = FRIENDS_BY_ID[id];
                  if (!f) return null;
                  return (
                    <div key={id} className="friend-pill-presence lurking">
                      <span className="presence-dot-small" />
                      <span className="friend-pill-avatar" style={{ background: f.color, opacity: 0.4 }}>{f.name[0]}</span>
                      <span>{f.name.toLowerCase()}</span>
                      <span className="lurker-label">reading</span>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {conversations.length > 0 && (
          <>
            <div className="chat-sidebar-section">recent</div>
            <div className="chat-history-list">
              {conversations.map((c) => (
                <div
                  key={c._id}
                  className={`chat-history-item ${c._id === activeConversation ? "active" : ""}`}
                  onClick={() => handleLoadConversation(c._id, c)}
                >
                  {c.title}
                </div>
              ))}
            </div>
          </>
        )}

        <button className="chat-new-btn" onClick={handleNewChat}>
          + new chat
        </button>

        <a href="/configure" style={{
          display: "block", padding: "10px 16px", fontSize: 12,
          color: "var(--ink-faint)", fontFamily: "var(--font-mono)",
          textDecoration: "none", letterSpacing: "0.06em",
        }}>
          ⚙ configure pod
        </a>
        <div className="chat-sidebar-legal">
          <a href="/privacy">privacy</a>
          <a href="/delete-account">delete account</a>
        </div>
      </aside>

      {/* Center */}
      <div className="chat-center">
        <div className="chat-header">
          <span className="chat-header-title">the lounge</span>
          {pod.length > 0 && (
            <span className="chat-header-tag">
              {pod.length} friends in the room
            </span>
          )}
          <CreditPill credits={credits} onClick={openRecharge} />
          <button
            ref={moodTriggerRef}
            className="chat-mood-trigger"
            onClick={() => setMoodOpen(!moodOpen)}
            title="Session mood"
          >
            <span className="chat-mood-dot" /> set the mood
          </button>

          {moodOpen && (
            <div className="chat-mood-panel" ref={moodPanelRef}>
              <div className="chat-mood-section">
                <div className="chat-mood-label">modes</div>
                <div className="chat-mood-pills">
                  {MODES.map(mode => (
                    <button
                      key={mode.id}
                      className={`chat-mood-pill ${sessionModes.includes(mode.id) ? "chat-mood-pill--active" : ""}`}
                      onClick={() => toggleMode(mode.id)}
                      title={mode.desc}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chat-mood-section">
                <div className="chat-mood-label">pacing</div>
                <div className="chat-mood-segmented">
                  {PACING_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      className={`chat-mood-segment ${sessionPacing === opt ? "chat-mood-segment--active" : ""}`}
                      onClick={() => setSessionPacing(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chat-mood-section">
                <div className="chat-mood-label">energy</div>
                <div className="chat-mood-segmented">
                  {ENERGY_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      className={`chat-mood-segment ${sessionEnergy === opt ? "chat-mood-segment--active" : ""}`}
                      onClick={() => setSessionEnergy(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <button className="chat-mood-done" onClick={() => setMoodOpen(false)}>
                done
              </button>
            </div>
          )}
        </div>

        <div className="chat-messages" ref={chatContainerRef}>
          {messages.map((m, idx) => {
            const replyMsg = m.replyTo ? [...messages].slice(0, idx).reverse().find(prev => prev.from === m.replyTo) : undefined;
            return (
            <ChatMessage
              key={m.id}
              from={m.from}
              text={m.text}
              isUser={m.from === "user"}
              replyTo={m.replyTo}
              replyToText={replyMsg?.text}
              mediaType={m.mediaType}
              mediaUrl={m.mediaUrl}
              mediaThumbnailUrl={m.mediaThumbnailUrl}
              mediaAltText={m.mediaAltText}
              onReport={async (reason) => {
                await createReport({
                  username: settingsUsername ?? undefined,
                  conversationId: activeConversation ?? undefined,
                  from: m.from,
                  text: m.text || m.mediaUrl || "",
                  reason,
                });
              }}
            />
            );
          })}

          {typingAgents.length > 0 && (
            <TypingIndicator
              typingAgents={typingAgents}
              friends={friendsRecord}
            />
          )}

          {isWindingDown && (
            <div className="chat-winding-down">
              conversation settling...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-composer-wrapper">
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Right panel — decision */}
      <DecisionPanel
        decision={decision}
        onSelect={handleDecisionSelect}
        className={mobileDecisionOpen ? "open" : ""}
      />

      {/* Mobile decision toggle */}
      {decision && (
        <button
          className="chat-decision-toggle"
          onClick={() => setMobileDecisionOpen(!mobileDecisionOpen)}
          aria-label="Toggle decision panel"
        >
          ?
        </button>
      )}
      {overlays}
    </div>
  );
}
