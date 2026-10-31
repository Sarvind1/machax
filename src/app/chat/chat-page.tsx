"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Capacitor } from "@capacitor/core";
import { AuthRequired, authedFetch, getStoredUser, guestFetch } from "@/lib/api";
import { PaymentError, buyTopupWeb } from "@/lib/razorpay-checkout";
import { NativePurchaseError, buyTopupNative, configurePurchases, waitForCredit } from "@/lib/purchases-native";
import { signOut } from "@/lib/firebase";
import type { CreditSummary } from "@/lib/credits";
import { MAX_HISTORY_ENTRIES, MAX_POD_SIZE } from "@/lib/chat-limits";
import { logEvent } from "@/lib/analytics";
import { logAchievementUnlocked, logFirstDilemmaPosted } from "@/lib/meta-events";
import { GUEST_TYPED_LIMIT, isExamplePrompt, type GuestUsage } from "@/lib/guest-limits";
import {
  getGuest,
  guestNeedsSignIn,
  guestUsername,
  bumpGuestUsage,
  saveGuestUsage,
  setGuestResume,
  takeGuestResume,
  reportSignInWall,
  type GuestState,
} from "@/lib/guest";
import { API_BASE } from "@/lib/api-base";
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
import { FRIENDS, FRIENDS_BY_ID, STARTERS, type Friend } from "@/lib/friends";
import { GROUPS, GROUPS_BY_KEY, compactCreditLabel, pickGroup, podForGroup, type GroupKey } from "@/lib/groups";

type ChatMessageWithReply = ChatMessageType & {
  replyTo?: string;
  mediaType?: "gif" | "sticker" | "meme";
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaAltText?: string;
};

import ChatMessage from "./components/chat-message";
import ChatComposer from "./components/chat-composer";
import { HelplineCard, StarterChips, cardFrom, isCardMessage, type CardKind, type HelplineInfo } from "./components/chat-cards";
import { pickShareLines } from "./components/share-card";
import { classifyByRules } from "@/lib/intent";
import TypingIndicator from "./components/typing-indicator";
import { useStickToBottom } from "./use-stick-to-bottom";
import RechargeSheet from "./components/recharge-sheet";
import { onBack } from "@/lib/back-nav";
import { isCardStale, lastCardFrom, type LastCard } from "@/lib/vote-card";
import { planReveal } from "@/lib/reply-pacing";
import { VotePanel, VotePill, VoteSheet } from "./components/vote-dock";
import AppHeader from "./home/app-header";
import AmbientBanter from "./home/ambient-banter";
import HomeComposer from "./home/home-composer";
import GroupLabel from "./home/group-label";
import PromptMarquee from "./home/prompt-marquee";
import PastChatsSheet from "./home/past-chats-sheet";
import AccountSheet from "./home/account-sheet";
import SendMorph from "./home/send-morph";
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
// After cutting a round off, how long to keep retrying while the server finishes stopping it.
const BUSY_RETRY_MS = 15_000;
const BUSY_RETRY_STEP_MS = 750;

// Short pill labels for the starter questions; a tap fills the full text.
const PROMPT_LABELS: Record<string, string> = {
  "My friend owes me 15k and keeps posting Goa stories": "friend owes me 15k",
  "Mom set up a rishta meeting this Sunday. Do I go?": "rishta meeting on sunday",
  "Boss texts me on Sunday nights. Reply or ignore?": "boss texts me on sundays",
  "My ex liked my story at 2am. Should I reply?": "my ex liked my story at 2am",
  "Got a 30% hike offer but the new team seems toxic": "30% hike, toxic team",
  "Friends want a Bali trip. I have 40k in savings": "bali trip on 40k savings?",
  "She left me on seen for 2 days. Do I double text?": "left on seen for 2 days",
  "Parents want me home by 10pm. I'm 24": "home by 10pm at 24?",
};
const PROMPTS = STARTERS.map((s) => ({
  label: PROMPT_LABELS[s.text] ?? s.text.toLowerCase(),
  text: s.text,
}));

// Plain words for the account sheet: "12 messages left".
function accountCreditsLabel(credits: CreditSummary | null, guest: GuestState | null): string | null {
  if (guest) {
    const left = Math.max(0, GUEST_TYPED_LIMIT - guest.typedUsed);
    return `${left} free ${left === 1 ? "message" : "messages"} left`;
  }
  if (!credits) return null;
  const n = Math.max(0, credits.messagesLeft);
  return `${n} ${n === 1 ? "message" : "messages"} left`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

// Older chats only stored a tag; guess the group back from it when it matches.
function groupFromTag(tag: string | undefined): GroupKey | null {
  return GROUPS.find((g) => g.tags[0] === tag)?.key ?? null;
}

export default function ChatPage() {
  const router = useRouter();
  // true once we know who this is: a signed-in user, or a guest (signed out).
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  // Set only while signed out: the guest id and how many messages it has used.
  const [guest, setGuest] = useState<GuestState | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  // Bottom sheets from the header: past chats (clock) and account (initials).
  const [pastOpen, setPastOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const leavingRef = useRef(false);
  // Background wait for a Play top-up to land; aborted on unmount.
  const creditPollRef = useRef<AbortController | null>(null);
  useEffect(() => () => creditPollRef.current?.abort(), []);

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
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // userName for display (can be display name)
  const userName = useMemo(() => {
    const user = getStoredUser();
    return user?.name || user?.username || "friend";
  }, []);

  // Username for Convex queries (must match what /configure saves under).
  // A guest's chats are stored under "guest:<id>" until sign-in moves them.
  const accountUsername = useMemo(() => getStoredUser()?.username ?? null, []);
  const guestId = guest?.guestId ?? null;
  const settingsUsername = accountUsername ?? (guestId ? guestUsername(guestId) : null);

  // Load user's saved settings from Convex (pod size, character overrides, etc.)
  const userSettings = useQuery(api.settings.get, accountUsername ? { username: accountUsername } : "skip");

  const [activeConversation, setActiveConversation] = useState<ConversationId | null>(null);
  const activeConversationRef = useRef<ConversationId | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  const [messages, setMessages] = useState<ChatMessageWithReply[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  // The option picked on the newest vote card (Convex, or set right away on tap).
  const [pickedOptionId, setPickedOptionId] = useState<string | null>(null);
  // The vote card sits outside the chat stream. A round only says a card can
  // be made (cardTeaser); it is made when the user opens it.
  const [cardTeaser, setCardTeaser] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [voteSheetOpen, setVoteSheetOpen] = useState(false);
  const [pod, setPod] = useState<Friend[]>([]);
  const [input, setInput] = useState("");
  // Home: the group the user picked by hand (null = guess from the text).
  const [groupPick, setGroupPick] = useState<GroupKey | null>(null);
  // Open chat: the group it was asked to (null when unknown, e.g. old chats).
  const [chatGroup, setChatGroup] = useState<GroupKey | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  // First send: the ask card flies into the first bubble. Set only after the
  // guest wall and credit checks pass.
  const [morph, setMorph] = useState<{ from: DOMRect; text: string } | null>(null);
  // Between the first send and the conversation being created.
  const [creating, setCreating] = useState(false);
  const homeCardRef = useRef<HTMLFormElement>(null);
  const creatingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  // Bumped per round so the safety timeout below restarts when a round is cut off.
  const [roundSeq, setRoundSeq] = useState(0);
  const [typingAgents, setTypingAgents] = useState<string[]>([]);
  const [joinedAgents, setJoinedAgents] = useState<string[]>([]);
  const [lurkingAgents, setLurkingAgents] = useState<string[]>([]);
  const [isWindingDown, setIsWindingDown] = useState(false);
  const [activeAgentIds, setActiveAgentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const user = getStoredUser();
    // Back from the sign-in screen: reopen the chat they were in, with their text.
    const resume = takeGuestResume();
    if (resume?.conversationId) {
      setActiveConversation(resume.conversationId as ConversationId);
      setPod((resume.podFriendIds ?? []).map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
    }
    if (resume?.draft) setInput(resume.draft);
    if (!user) {
      // Signed out: chat as a guest. The server allows a few messages.
      setGuest(getGuest());
      setIsAuthed(true);
      return;
    }
    setIsAuthed(true);
    // Android only: ties Play purchases to this account. No-op on the web.
    void configurePurchases(user.uid);
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
  const isStreamingRef = useRef(false);
  // A message sent mid-round cuts the running round off and starts a new one.
  // roundRef numbers the rounds; a stream whose number is no longer current
  // stops touching state. abortRef aborts its fetch, which makes the server
  // stop that round (its queued replies are dropped) and bill only what it used.
  const roundRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Did the current round get a friend reply yet, and was its message an example?
  // The server counts a guest message once it got a reply.
  const roundDeliveredRef = useRef(false);
  const roundExampleRef = useRef(false);
  // Shows the current round's queued replies right away (see streamChat).
  const flushRepliesRef = useRef<(() => ChatMessageType[]) | null>(null);

  const conversations = useSafeQuery<any[]>(
    api.conversations.list,
    settingsUsername ? { username: settingsUsername } : "skip"
  ) ?? [];
  const activeTitle: string | undefined = conversations.find((c) => c._id === activeConversation)?.title;
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
        setPickedOptionId(convexDecision.selectedOptionId ?? null);
      } else {
        setDecision(null);
        setPickedOptionId(null);
      }
    }
  }, [convexDecision, isLoading]);

  // On open (signed in or guest): if an earlier pick is due a "so... did you do it?",
  // the server adds that friend message and we open that chat. Once per open.
  const followUpCheckedRef = useRef(false);
  // Set when a chat is opened for its follow-up: jump to the newest message once it loads.
  const scrollToEndRef = useRef(false);
  useEffect(() => {
    if ((!accountUsername && !guestId) || followUpCheckedRef.current) return;
    followUpCheckedRef.current = true;
    (async () => {
      try {
        const res = guestId
          ? await guestFetch("/api/follow-up", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ guestId }),
            })
          : await authedFetch("/api/follow-up", { method: "POST" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          followUp: { conversationId: string; podFriendIds: string[] } | null;
        };
        const f = body.followUp;
        // Don't pull the user out of a chat they already started.
        if (!f || activeConversationRef.current || isStreamingRef.current) return;
        scrollToEndRef.current = true;
        setActiveConversation(f.conversationId as ConversationId);
        setPod(f.podFriendIds.map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
        logEvent("follow_up_shown", {});
      } catch {
        // No follow-up this time.
      }
    })();
  }, [accountUsername, guestId]);

  // Stick to the newest message (replies, vote card, GIFs) unless the user
  // scrolled up to read. Sending a message, or opening a chat, jumps back down.
  const { ref: chatScrollRef, pin: pinToBottom } = useStickToBottom(activeConversation);
  const lastUserMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (scrollToEndRef.current && messages.length > 0) {
      scrollToEndRef.current = false;
      pinToBottom();
    } else if (last?.from === "user" && last.id !== lastUserMsgIdRef.current) {
      pinToBottom();
    }
    if (last?.from === "user") lastUserMsgIdRef.current = last.id;
  }, [messages, pinToBottom]);

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
  }, [isLoading, roundSeq]);

  // Out of free guest messages: remember where they were (and what they typed)
  // and open the sign-in screen. After sign-in the chat moves to the account.
  const promptSignIn = useCallback(
    (draft: string, convoId?: ConversationId | null, podIds?: string[]) => {
      setGuestResume({
        ...(convoId ? { conversationId: convoId as string } : {}),
        ...(podIds && podIds.length > 0 ? { podFriendIds: podIds } : {}),
        ...(draft ? { draft } : {}),
      });
      logEvent("guest_limit_reached", {});
      router.push("/login?from=guest");
    },
    [router],
  );

  // A card in the chat stream (helpline, chips, vote) is stored as a message
  // from "card:<kind>" with its data as JSON, so it keeps its place on reload.
  const addCard = useCallback(
    (kind: CardKind, payload: unknown, target: ConversationId) => {
      const text = JSON.stringify(payload);
      const from = cardFrom(kind);
      setMessages((prev) => [
        ...prev,
        { id: `${from}-${Date.now()}-${Math.random()}`, conversationId: target as string, from, text, timestamp: Date.now() },
      ]);
      if (settingsUsername) {
        sendMessage({ conversationId: target, from, text, username: settingsUsername }).catch(() => {});
      }
    },
    [sendMessage, settingsUsername],
  );

  const streamChat = useCallback(
    async (
      message: string,
      convoId: ConversationId,
      podIds: string[],
      history: { from: string; text: string }[],
      opts: {
        interrupting?: boolean;
        pickedOption?: { label: string; voices: string[] };
        // The newest vote card so far, so the server doesn't re-ask it.
        lastCard?: LastCard;
        // Only make the vote card for the chat so far (the user opened the teaser).
        cardOnly?: boolean;
        // Runs once the server takes the round (saves the user's message), so a
        // message sent back to the text box is never also stored as sent.
        onAccepted?: () => Promise<void>;
      } = {}
    ) => {
      const round = ++roundRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const live = () => roundRef.current === round;
      roundDeliveredRef.current = false;
      // Small talk, distress and picks don't use a typed guest message either.
      roundExampleRef.current = isExamplePrompt(message) || !!opts.pickedOption || !!opts.cardOnly || classifyByRules(message).intent !== "dilemma";
      setRoundSeq(round);
      setIsLoading(true);
      isStreamingRef.current = true;
      try {
        const init: RequestInit = {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(guestId ? { guestId } : {}),
            ...(opts.pickedOption ? { pickedOption: opts.pickedOption } : {}),
            ...(opts.lastCard ? { lastCard: opts.lastCard } : {}),
            // Old app builds send neither and still get the card inline.
            ...(opts.cardOnly ? { cardOnly: true } : { lazyCard: true }),
            // Cut the running round off: the server hands this message the lock right away.
            ...(opts.interrupting ? { interrupting: true } : {}),
            conversationId: convoId,
            message,
            // The server rejects bigger pods and keeps only the last history entries.
            podFriendIds: podIds.slice(0, MAX_POD_SIZE),
            history: history.slice(-MAX_HISTORY_ENTRIES),
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
        };
        // Signed out: no token, the server counts it as a guest message.
        const post = () => (guestId ? guestFetch("/api/chat", init) : authedFetch("/api/chat", init));
        let response = await post();
        // Cut a round off: the server frees the old round's lock once it has
        // stopped it (a few seconds at most), so retry "busy" for a while.
        const busyDeadline = Date.now() + BUSY_RETRY_MS;
        while (response.status === 409 && opts.interrupting && Date.now() < busyDeadline) {
          await new Promise((r) => setTimeout(r, BUSY_RETRY_STEP_MS));
          if (!live()) return;
          response = await post();
        }
        if (!live()) return;

        // Not sent after all: the text goes back to the box, so drop its (unsaved)
        // bubble. A pick's message is already saved, so it stays.
        const dropBubble = () =>
          !opts.cardOnly &&
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last && last.from === "user" && last.text === message ? prev.slice(0, -1) : prev;
          });
        const takeBack = () => {
          if (opts.onAccepted) dropBubble();
        };
        if (response.status === 403 && guestId) {
          // The server says this guest is out of free messages: take back the
          // unanswered message and ask for sign-in, keeping the text.
          const body = (await response.json().catch(() => null)) as { guest?: GuestUsage } | null;
          if (body?.guest) setGuest(saveGuestUsage(body.guest));
          dropBubble();
          promptSignIn(opts.cardOnly ? "" : message, convoId, podIds);
          return;
        }
        if (response.status === 429) {
          takeBack();
          if (!opts.cardOnly) setInput((current) => current || message);
          setToast("lots of people chatting from this network. sign in or try again in a bit");
          return;
        }
        if (response.status === 401) {
          await goToLogin();
          return;
        }
        if (response.status === 402) {
          const body = (await response.json().catch(() => null)) as { credits?: CreditSummary } | null;
          if (body?.credits) setCredits(body.credits);
          takeBack();
          if (!opts.cardOnly) setInput((current) => current || message);
          setRechargeOpen(true);
          return;
        }
        if (response.status === 409) {
          takeBack();
          if (!opts.cardOnly) setInput((current) => current || message);
          setToast("still replying, give it a sec");
          return;
        }
        // Sent (even if the server then failed): keep it as a sent message.
        await opts.onAccepted?.();
        if (!response.ok || !response.body) {
          throw new Error("Chat API request failed");
        }
        if (!live()) return;

        // Replies are handled in order through `paced`: each friend's reply waits
        // its turn and some typing time (see reply-pacing.ts); other events wait
        // for the replies before them. Saving to Convex happens on arrival, so a
        // round cut off mid-way still keeps everything the server sent.
        type StreamEvent = ReturnType<typeof JSON.parse>;
        const handle = async (data: StreamEvent) => {
          if (!live()) return;
          try {
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
              roundDeliveredRef.current = true;
              // Track agents that have actually spoken
              if (data.from !== "user") {
                setActiveAgentIds(prev => new Set([...prev, data.from]));
              }
              // Remove this friend from typing list
              setTypingAgents((prev) => prev.filter((id) => id !== data.from));
              // Already shown if the user sent something while it was queued.
              if (unshown.delete(data)) setMessages((prev) => [...prev, toMessage(data)]);
              if (data.mediaType) logEvent("gif_received", { media_type: data.mediaType });
            }

            if (data.typing) {
              setTypingAgents((prev) =>
                prev.includes(data.typing) ? prev : [...prev, data.typing]
              );
            }

            if (data.helpline) addCard("helpline", data.helpline, convoId);
            if (Array.isArray(data.chips) && data.chips.length > 0) addCard("chips", data.chips, convoId);

            if (data.cardReady) setCardTeaser(true);

            if (data.decision) {
              setDecision(data.decision);
              setPickedOptionId(null);
              setCardTeaser(false);
              addCard("vote", data.decision, convoId);
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

            if (data.guest && typeof data.guest.typedUsed === "number") {
              setGuest(saveGuestUsage(data.guest as GuestUsage));
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
          } catch {
            // A bad event shouldn't stop the round.
          }
        };
        const persist = async (data: StreamEvent) => {
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
        };
        const toMessage = (data: StreamEvent): ChatMessageWithReply => ({
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
        });
        let paced: Promise<void> = Promise.resolve();
        let lastRevealAt = Date.now();
        const typingSince = new Map<string, number>();
        // Replies that arrived but are still waiting their turn on screen. If the
        // user sends a message meanwhile, they're shown at once, before it.
        const unshown = new Set<StreamEvent>();
        flushRepliesRef.current = () => {
          const shown = [...unshown].map(toMessage);
          unshown.clear();
          if (shown.length > 0) setMessages((prev) => [...prev, ...shown]);
          return shown;
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (!live()) {
            reader.cancel().catch(() => {});
            return;
          }
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!live()) return;
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            let data: StreamEvent;
            try {
              data = JSON.parse(jsonStr);
            } catch {
              continue; // Skip malformed JSON lines
            }
            let revealAt = 0;
            if (typeof data.typing === "string") typingSince.set(data.typing, Date.now());
            if (data.from && data.text && data.from !== "user") {
              void persist(data);
              unshown.add(data);
              revealAt = planReveal({ now: Date.now(), text: String(data.text), typingSince: typingSince.get(data.from), lastRevealAt });
              lastRevealAt = revealAt;
              typingSince.delete(data.from);
            }
            paced = paced.then(async () => {
              const wait = revealAt - Date.now();
              if (wait > 0) await new Promise((r) => setTimeout(r, wait));
              await handle(data);
            });
          }
        }
        // Let the queued replies finish appearing before the round ends.
        await paced;
      } catch (err) {
        // Aborted because a newer message cut this round off: not an error.
        if (!live() || controller.signal.aborted) return;
        if (isSignedOut(err)) {
          await goToLogin();
          return;
        }
        console.error("Chat stream error:", err);
      } finally {
        // Only the current round owns the loading state.
        if (live()) {
          abortRef.current = null;
          isStreamingRef.current = false;
          setIsLoading(false);
          setTypingAgents([]);
        }
      }
    },
    [sendMessage, upsertDecision, userName, sessionModes, sessionPacing, sessionEnergy, userSettings, settingsUsername, goToLogin, guestId, promptSignIn, addCard]
  );

  // Sends `raw` (the composer text, or a tapped chip).
  const submitText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || creatingRef.current) return;
    // Sent while friends are still replying: cut that round off; the new round
    // gets everything said so far plus this message, so friends react to it.
    const interrupting = isLoading;
    let guestNow = guest;
    // Replies still queued on screen show now, and count as said before this message.
    const flushed = interrupting ? flushRepliesRef.current?.() ?? [] : [];
    if (interrupting) {
      roundRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      setTypingAgents([]);
      // The cut-off round got a reply, so the server counted it; count it here too
      // (the round's own count update never arrives now).
      if (guest && roundDeliveredRef.current) {
        guestNow = bumpGuestUsage(roundExampleRef.current);
        setGuest(guestNow);
      }
    }

    // Guests: typed messages are limited, ready-made examples are not (up to the hard cap).
    // Out of typed messages, a typed one still goes to the server, which answers
    // small talk and distress for free and sends anything else to sign-in.
    // Distress is answered even at the hard cap.
    // Out of typed messages and this reads as a real question (not small talk,
    // distress or an example): show sign-in now instead of waiting seconds for
    // the server to say so. The server still checks (403 below) as a backstop.
    const ruleKind = classifyByRules(text).intent;
    const freeForGuest = ruleKind !== "dilemma" || isExamplePrompt(text);
    if (guestNow && ruleKind !== "distress" && guestNeedsSignIn(guestNow, freeForGuest)) {
      if (interrupting) {
        isStreamingRef.current = false;
        setIsLoading(false);
      }
      reportSignInWall(API_BASE, guestNow, activeConversation);
      promptSignIn(text, activeConversation, pod.map((f) => f.id));
      return;
    }

    // Known to be out of credit: offer a top-up instead of sending. The text stays in the box.
    if (credits?.messagesLeft === 0) {
      setRechargeOpen(true);
      return;
    }

    setInput("");
    // A teaser from the last round is about an older message now.
    setCardTeaser(false);

    // Guard against Convex reactive query overwriting local state during the
    // submit flow.  The sendMessage mutation triggers the convexMessages query
    // to update, and the useEffect that syncs convexMessages → setMessages
    // checks isStreamingRef.  We must set it *before* any Convex mutation so
    // the guard is active when the reactive query fires.
    isStreamingRef.current = true;

    if (!activeConversation) {
      // First message — create conversation. The group (picked by hand, or
      // guessed from the text) chooses the friends, unless the user saved
      // their own pod in /configure.
      const groupKey: GroupKey = groupPick ?? pickGroup(text);
      const tag = GROUPS_BY_KEY[groupKey].tags[0] ?? "life";
      const maxPod = Math.min(userSettings?.podSize || MAX_POD_SIZE, MAX_POD_SIZE);

      let podIds = podForGroup(groupKey, maxPod);
      if (userSettings?.characterOverrides) {
        try {
          const overrides = JSON.parse(userSettings.characterOverrides) as Record<string, { active?: boolean }>;
          const activeIds = Object.entries(overrides)
            .filter(([, v]) => v?.active !== false)
            .map(([id]) => id);
          if (activeIds.length > 0) podIds = activeIds.slice(0, maxPod);
        } catch {
          // bad saved settings: keep the group's pod
        }
      }

      const selectedPod = podIds.map(id => FRIENDS_BY_ID[id]).filter(Boolean);
      setPod(selectedPod);
      setChatGroup(groupKey);
      setGroupPick(null);

      // Show the chat right away with the user's bubble; the ask card flies
      // into it while the conversation is created.
      const userMsg: ChatMessageType = {
        id: `user-${Date.now()}`,
        conversationId: "",
        from: "user",
        text,
        timestamp: Date.now(),
      };
      const card = homeCardRef.current;
      if (card) setMorph({ from: card.getBoundingClientRect(), text });
      setComposerFocused(false);
      setMessages([userMsg]);
      creatingRef.current = true;
      setCreating(true);
      // "new chat" / back while creating bumps roundRef: then drop this chat.
      const startRound = roundRef.current;

      try {
        const convoId = await createConversation({
          title: text.slice(0, 60),
          tag,
          podFriendIds: podIds,
          sessionMood: JSON.stringify({ modes: sessionModes, pacing: sessionPacing, energy: sessionEnergy }),
          username: settingsUsername || undefined,
        });
        creatingRef.current = false;
        setCreating(false);
        if (roundRef.current !== startRound) {
          isStreamingRef.current = false;
          return;
        }

        setActiveConversation(convoId);
        logEvent("dilemma_posted", { pod_size: podIds.length, topic: tag, group: groupKey });
        logFirstDilemmaPosted();

        await streamChat(text, convoId, podIds, [], {
          onAccepted: async () => {
            try {
              await sendMessage({ conversationId: convoId, from: "user", text, username: settingsUsername! });
            } catch {
              // continue even if Convex fails
            }
          },
        });
      } catch (err) {
        console.error("Failed to create conversation:", err);
        isStreamingRef.current = false;
        // Not created: back to home with the text still in the box.
        if (creatingRef.current) {
          creatingRef.current = false;
          setCreating(false);
          setMorph(null);
          setMessages([]);
          setPod([]);
          setChatGroup(null);
          setInput((current) => current || text);
          setToast("couldn't start the chat. try again");
        }
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
      const convoId = activeConversation;

      const history = [...messages, ...flushed].filter((m) => !isCardMessage(m.from)).map((m) => ({ from: m.from, text: m.text }));

      try {
        await streamChat(
          text,
          activeConversation,
          pod.map((f) => f.id),
          history,
          {
            interrupting,
            lastCard: lastCardFrom([...messages, ...flushed]),
            onAccepted: async () => {
              try {
                await sendMessage({ conversationId: convoId, from: "user", text, username: settingsUsername! });
              } catch {
                // continue even if Convex fails
              }
            },
          }
        );
      } catch (err) {
        console.error("Stream failed on subsequent message:", err);
        isStreamingRef.current = false;
        setIsLoading(false);
        setTypingAgents([]);
      }
    }
  }, [isLoading, activeConversation, pod, messages, createConversation, sendMessage, streamChat, sessionModes, sessionPacing, sessionEnergy, userSettings, settingsUsername, credits, guest, promptSignIn, groupPick]);

  const handleSubmit = useCallback(() => submitText(input), [submitText, input]);

  const handleNewChat = () => {
    // Leaving mid-round: stop that round so its replies don't land in the new chat.
    roundRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    isStreamingRef.current = false;
    setActiveConversation(null);
    setMessages([]);
    setDecision(null);
    setCardTeaser(false);
    setVoteSheetOpen(false);
    setPod([]);
    setInput("");
    setTypingAgents([]);
    setIsLoading(false);
    setJoinedAgents([]);
    setLurkingAgents([]);
    setIsWindingDown(false);
    setActiveAgentIds(new Set());
    setMorph(null);
    creatingRef.current = false;
    setCreating(false);
    setChatGroup(null);
    setGroupPick(null);
  };

  // Android back inside chat: close an open sheet or panel first, then leave the
  // open conversation for the chat home. On the home screen back closes the app.
  const backStateRef = useRef({ inChat: false, rechargeOpen: false, moodOpen: false, voteSheetOpen: false, pastOpen: false, accountOpen: false });
  const handleNewChatRef = useRef(handleNewChat);
  useEffect(() => {
    backStateRef.current = {
      inChat: activeConversation !== null || messages.length > 0,
      rechargeOpen,
      moodOpen,
      voteSheetOpen,
      pastOpen,
      accountOpen,
    };
    handleNewChatRef.current = handleNewChat;
  });
  useEffect(
    () =>
      onBack(() => {
        const st = backStateRef.current;
        if (st.pastOpen) setPastOpen(false);
        else if (st.accountOpen) setAccountOpen(false);
        else if (st.rechargeOpen) setRechargeOpen(false);
        else if (st.voteSheetOpen) setVoteSheetOpen(false);
        else if (st.moodOpen) setMoodOpen(false);
        else if (st.inChat) handleNewChatRef.current();
        else return false;
        return true;
      }),
    [],
  );

  const handleLoadConversation = (convoId: ConversationId, convo: { podFriendIds: string[]; tag?: string }) => {
    setMorph(null);
    setActiveConversation(convoId);
    setChatGroup(groupFromTag(convo.tag));
    setPod(convo.podFriendIds.map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
    setDecision(null);
    setCardTeaser(false);
    setVoteSheetOpen(false);
  };

  // Opening the vote card: if the latest round has a teaser, make the card now
  // (one cheap call); otherwise the card already made is shown, no model call.
  const requestCard = async () => {
    // Never while friends are replying: starting a request cuts the running round off.
    if (!cardTeaser || cardLoading || isLoading || !activeConversation) return;
    const lines = messages.filter((m) => !isCardMessage(m.from));
    const lastUser = [...lines].reverse().find((m) => m.from === "user");
    if (!lastUser) return;
    setCardLoading(true);
    try {
      await streamChat(
        lastUser.text,
        activeConversation,
        pod.map((f) => f.id),
        lines.map((m) => ({ from: m.from, text: m.text })),
        { cardOnly: true, lastCard: lastCardFrom(messages) },
      );
    } finally {
      // No new card means the last one still stands; either way the teaser is used up.
      setCardTeaser(false);
      setCardLoading(false);
    }
  };
  const openVoteSheet = () => {
    setVoteSheetOpen(true);
    void requestCard();
  };

  // Tapping an option on the vote card: save the pick, post it as the user's
  // message, and let the friends react to it in the chat.
  const handleDecisionSelect = async (optionId: string) => {
    if (!activeConversation || !settingsUsername || !decision) return;
    // A pick sent mid-round used to cut off the replies to a newer typed message
    // (lost rounds on 29 Oct). The card is disabled then too; this is the backstop.
    if (isLoading || isCardStale(messages, messages.map((m) => m.from).lastIndexOf(cardFrom("vote")))) return;
    const option = decision.options.find((o) => o.id === optionId);
    if (!option) return;
    setPickedOptionId(optionId);
    try {
      await selectDecision({
        conversationId: activeConversation,
        optionId,
        username: settingsUsername,
      });
      logEvent("decision_picked", { option_count: decision.options.length });
      // No account yet: AchievementUnlocked is sent after sign-in, when this chat moves over.
      if (!guest) logAchievementUnlocked(settingsUsername);
    } catch (err) {
      console.error("Failed to select decision:", err);
      setPickedOptionId(null);
      return;
    }

    setVoteSheetOpen(false);
    const flushed = flushRepliesRef.current?.() ?? [];
    const text = `going with: ${option.label}`;
    const history = [...messages, ...flushed].filter((m) => !isCardMessage(m.from)).map((m) => ({ from: m.from, text: m.text }));
    isStreamingRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, conversationId: activeConversation as string, from: "user", text, timestamp: Date.now() },
    ]);
    sendMessage({ conversationId: activeConversation, from: "user", text, username: settingsUsername }).catch(() => {});
    await streamChat(text, activeConversation, pod.map((f) => f.id), history, {
      interrupting: isLoading,
      pickedOption: { label: option.label, voices: option.voices },
    });
    if (guest) setToast("locked in. sign in to keep your decisions");
  };

  // The newest vote card, shown in the pill / panel; only it can be picked from.
  const lastVoteIdx = messages.map((m) => m.from).lastIndexOf(cardFrom("vote"));
  const voteDock = {
    decision,
    pickedId: pickedOptionId,
    teaser: cardTeaser,
    loading: cardLoading,
    onPick: (id: string) => void handleDecisionSelect(id),
    shareLines: pickShareLines((lastVoteIdx >= 0 ? messages.slice(0, lastVoteIdx) : messages).filter((x) => !isCardMessage(x.from))),
    stale: isCardStale(messages, lastVoteIdx),
    busy: isLoading,
  };

  const friendsRecord = Object.fromEntries(
    FRIENDS.map((f) => [f.id, { name: f.name, color: f.color }])
  );

  const openRecharge = () => setRechargeOpen(true);
  const closeRecharge = () => {
    setRechargeOpen(false);
    setBuyError(null);
  };

  const fetchCredits = async (): Promise<CreditSummary> => {
    const res = await authedFetch("/api/credits");
    if (!res.ok) throw new Error(`credits request failed: ${res.status}`);
    return (await res.json()) as CreditSummary;
  };

  // After Play has the money: our server grants on RevenueCat's webhook, so
  // wait in the background for the balance to rise, then toast. Without a
  // known starting balance there is nothing to compare: go straight to "shortly".
  const awaitPlayCredit = async (before: CreditSummary | null) => {
    creditPollRef.current?.abort();
    const poll = new AbortController();
    creditPollRef.current = poll;
    const next = before ? await waitForCredit(before.balanceMicros, fetchCredits, undefined, poll.signal) : null;
    if (poll.signal.aborted) return;
    if (next) {
      setCredits(next);
      setToast(`credit added · ~${next.messagesLeft} messages`);
      return;
    }
    setToast("payment done, credit will show up shortly");
    // One more look so the pill is not stale.
    try {
      const latest = await fetchCredits();
      if (!poll.signal.aborted) setCredits(latest);
    } catch {
      // the next chat reply refreshes it anyway
    }
  };

  const handleBuy = async () => {
    if (buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // Play Billing via RevenueCat. Fresh balance first, state if that fails.
        const before = await fetchCredits().catch(() => credits);
        await buyTopupNative(getStoredUser()?.uid);
        // The purchase is done: free the sheet and wait for the credit in the background.
        closeRecharge();
        setBuying(false);
        void awaitPlayCredit(before);
        return;
      }
      // Web payments stay off until the Razorpay keys are set.
      if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
        setBuyError("We ran across an unknown issue, kindly reach out to sarvind@gritlabsai.co");
        return;
      }
      const { credits: next } = await buyTopupWeb();
      setCredits(next);
      setRechargeOpen(false);
      setToast(`credit added · ~${next.messagesLeft} messages`);
    } catch (err) {
      if (err instanceof AuthRequired) {
        await goToLogin();
        return;
      }
      if (err instanceof NativePurchaseError && err.code === "cancelled") {
        closeRecharge();
        return;
      }
      setBuyError(
        err instanceof PaymentError || err instanceof NativePurchaseError ? err.message : "payment didn't go through",
      );
    } finally {
      setBuying(false);
    }
  };

  const podIds = pod.map((f) => f.id);
  const signIn = () => promptSignIn(input.trim(), activeConversation, podIds);
  // Header balance: "12 left". Guests see their free messages; a tap signs in.
  const headerCredits = guest
    ? compactCreditLabel(GUEST_TYPED_LIMIT - guest.typedUsed)
    : credits
      ? compactCreditLabel(credits.messagesLeft)
      : null;
  const onHeaderTopUp = guest ? signIn : openRecharge;
  const initials = guest ? "" : initialsOf(userName);

  const moodPanel = moodOpen && (
    <div className="chat-mood-panel" ref={moodPanelRef}>
      <div className="chat-mood-section">
        <div className="chat-mood-label">modes</div>
        <div className="chat-mood-pills">
          {MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
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
              type="button"
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
              type="button"
              className={`chat-mood-segment ${sessionEnergy === opt ? "chat-mood-segment--active" : ""}`}
              onClick={() => { setSessionEnergy(opt); logEvent("mood_changed", { mood_type: "energy", mood: opt }); }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="chat-mood-done" onClick={() => setMoodOpen(false)}>
        done
      </button>
    </div>
  );

  // Shared by the home and chat views.
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
      <PastChatsSheet
        open={pastOpen}
        conversations={conversations}
        activeId={activeConversation}
        onPick={(id, convo) => {
          setPastOpen(false);
          handleLoadConversation(id as ConversationId, convo);
        }}
        onNew={() => {
          setPastOpen(false);
          handleNewChat();
        }}
        onClose={() => setPastOpen(false)}
      />
      <AccountSheet
        open={accountOpen}
        userName={guest ? null : userName}
        isGuest={!!guest}
        creditsLabel={accountCreditsLabel(credits, guest)}
        onTopUp={() => {
          setAccountOpen(false);
          openRecharge();
        }}
        onSignIn={() => {
          setAccountOpen(false);
          signIn();
        }}
        onSignOut={() => {
          setAccountOpen(false);
          void goToLogin();
        }}
        onEditPod={() => {
          setAccountOpen(false);
          router.push("/configure");
        }}
        onClose={() => setAccountOpen(false)}
      />
    </>
  );

  if (!isAuthed) {
    return (
      <div className="chat-page chat-page--loading">
        <p>loading...</p>
      </div>
    );
  }

  const isHome = !activeConversation && messages.length === 0;
  // The home layer stays on top for the morph so the banter can part.
  const showHome = isHome || morph !== null;
  const leaving = !isHome;
  const homeGroup: GroupKey = groupPick ?? pickGroup(input);
  const firstUserIdx = messages.findIndex((m) => m.from === "user");

  const homeLayer = (
    <div key="home" className={`chat-home${leaving ? " chat-home--leaving" : ""}`} aria-hidden={leaving || undefined}>
      <AppHeader
        variant="home"
        creditsLabel={headerCredits}
        onTopUp={onHeaderTopUp}
        onOpenPastChats={() => setPastOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
        initials={initials}
      />

      <div className="chat-home-live">
        <span className="chat-home-live-dot" aria-hidden="true" />
        <span>your friends are talking</span>
      </div>

      <div className="chat-home-stage">
        <AmbientBanter typing={input.length > 0} parting={leaving} />
      </div>

      <div className="chat-home-ask">
        <div className="chat-home-group">
          {input.trim() && (
            <GroupLabel
              groupKey={homeGroup}
              onChange={(key) => {
                setGroupPick(key);
                logEvent("group_changed", { group: key, where: "home" });
              }}
            />
          )}
        </div>
        <HomeComposer
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={leaving}
          cardRef={homeCardRef}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
        />
      </div>

      <div className={`chat-home-prompts${composerFocused && !leaving ? " chat-home-prompts--away" : ""}`}>
        <PromptMarquee prompts={PROMPTS} onPick={setInput} hidden={composerFocused || leaving} />
      </div>
    </div>
  );

  const chatLayer = (
    <div key="chat" className="chat-center">
      <div className="chat-head">
        <AppHeader
          variant="chat"
          creditsLabel={headerCredits}
          onTopUp={onHeaderTopUp}
          onOpenPastChats={() => setPastOpen(true)}
          onOpenAccount={() => setAccountOpen(true)}
          initials={initials}
          title={activeTitle ?? messages.find((m) => m.from === "user")?.text.slice(0, 60) ?? "the group chat"}
          podIds={podIds}
          onBack={handleNewChat}
          extra={
            <button
              ref={moodTriggerRef}
              type="button"
              className="chat-mood-trigger"
              onClick={() => setMoodOpen(!moodOpen)}
              aria-expanded={moodOpen}
            >
              mood
            </button>
          }
        />
        {moodPanel}
      </div>

      {chatGroup && (
        <div className="chat-group-row">
          <GroupLabel
            groupKey={chatGroup}
            onChange={(key) => {
              setChatGroup(key);
              // Next messages go to the new group's friends.
              const maxPod = Math.min(userSettings?.podSize || MAX_POD_SIZE, MAX_POD_SIZE);
              setPod(podForGroup(key, maxPod).map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
              logEvent("group_changed", { group: key, where: "chat" });
            }}
          />
        </div>
      )}

      <VotePill {...voteDock} onOpen={openVoteSheet} />

      <div className="chat-messages" ref={chatScrollRef}>
          {messages.map((m, idx) => {
            if (isCardMessage(m.from)) {
              let payload: unknown;
              try {
                payload = JSON.parse(m.text);
              } catch {
                return null;
              }
              if (m.from === cardFrom("helpline")) {
                return <HelplineCard key={m.id} helpline={payload as HelplineInfo} />;
              }
              if (m.from === cardFrom("chips")) {
                // Only under the newest message: older chips are stale.
                if (idx !== messages.length - 1 || !Array.isArray(payload)) return null;
                return <StarterChips key={m.id} chips={payload as string[]} onPick={(t) => void submitText(t)} />;
              }
              // Vote cards live in the pill / side panel now, not in the stream.
              return null;
            }
            const isFirstUser = idx === firstUserIdx;
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
              firstUser={isFirstUser}
              concealed={isFirstUser && morph !== null}
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
          disabled={creating}
          placeholder="reply to your friends…"
        />
      </div>
    </div>
  );

  return (
    <div className="chat-page">
      {showHome && homeLayer}
      {!isHome && chatLayer}
      {!isHome && <VotePanel {...voteDock} onRequest={() => void requestCard()} />}
      {!isHome && (
        <VoteSheet {...voteDock} open={voteSheetOpen} onClose={() => setVoteSheetOpen(false)} onRequest={() => void requestCard()} />
      )}
      {overlays}
      {morph && <SendMorph from={morph.from} text={morph.text} onDone={() => setMorph(null)} />}
    </div>
  );
}
