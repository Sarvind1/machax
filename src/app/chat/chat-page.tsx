"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
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
import ChatMessage from "./components/chat-message";
import ChatComposer from "./components/chat-composer";
import DecisionPanel from "./components/decision-panel";
import FriendPill from "./components/friend-pill";
import TypingIndicator from "./components/typing-indicator";
import "./chat.css";

type ConversationId = Id<"conversations">;

interface ProviderInfo {
  name: string;
  label: string;
  available: boolean;
  priority: number;
}

export default function ChatPage() {
  const [activeConversation, setActiveConversation] = useState<ConversationId | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [pod, setPod] = useState<Friend[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [typingAgents, setTypingAgents] = useState<string[]>([]);
  const [mobileDecisionOpen, setMobileDecisionOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [providerList, setProviderList] = useState<ProviderInfo[]>([]);

  // Probe providers on mount
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        if (data.active) setActiveProvider(data.active.label);
        if (data.providers) setProviderList(data.providers);
      })
      .catch(() => {});
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);

  const conversations = useSafeQuery<any[]>(api.conversations.list) ?? [];
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.messages.send);
  const upsertDecision = useMutation(api.decisions.upsert);
  const selectDecision = useMutation(api.decisions.select);

  // Load messages from Convex when conversation changes
  const convexMessages = useSafeQuery<any[]>(
    api.messages.list,
    activeConversation ? { conversationId: activeConversation } : "skip"
  );
  const convexDecision = useSafeQuery<any>(
    api.decisions.get,
    activeConversation ? { conversationId: activeConversation } : "skip"
  );

  useEffect(() => {
    if (convexMessages && !isLoading && !isStreamingRef.current) {
      setMessages(
        convexMessages.map((m) => ({
          id: m._id,
          conversationId: m.conversationId as string,
          from: m.from,
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingAgents]);

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
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convoId,
            message,
            podFriendIds: podIds,
            history,
          }),
        });

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

              if (data.provider) {
                setActiveProvider(data.provider);
              }

              if (data.from && data.text) {
                // Remove this friend from typing list
                setTypingAgents((prev) => prev.filter((id) => id !== data.from));
                const newMsg: ChatMessageType = {
                  id: `${data.from}-${Date.now()}-${Math.random()}`,
                  conversationId: convoId as string,
                  from: data.from,
                  text: data.text,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, newMsg]);

                // Persist to Convex
                try {
                  await sendMessage({
                    conversationId: convoId,
                    from: data.from,
                    text: data.text,
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
                  });
                } catch {
                  // Convex save failed — decision still shows in UI
                }
              }

              if (data.done) {
                setTypingAgents([]);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        console.error("Chat stream error:", err);
      } finally {
        isStreamingRef.current = false;
        setIsLoading(false);
        setTypingAgents([]);
      }
    },
    [sendMessage, upsertDecision]
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
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
      const selectedPod = selectPod([tag]);
      setPod(selectedPod);

      try {
        const convoId = await createConversation({
          title: text.slice(0, 60),
          tag,
          podFriendIds: selectedPod.map((f) => f.id),
        });

        setActiveConversation(convoId);

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
        });

        await streamChat(text, convoId, selectedPod.map((f) => f.id), []);
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
        });
      } catch {
        // continue even if Convex fails
      }

      const history = messages.map((m) => ({ from: m.from, text: m.text }));
      history.push({ from: "user", text });

      await streamChat(
        text,
        activeConversation,
        pod.map((f) => f.id),
        history
      );
    }
  }, [input, isLoading, activeConversation, pod, messages, createConversation, sendMessage, streamChat]);

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
  };

  const handleLoadConversation = (convoId: ConversationId, convo: { podFriendIds: string[] }) => {
    setActiveConversation(convoId);
    setPod(convo.podFriendIds.map((id) => FRIENDS_BY_ID[id]).filter(Boolean));
    setDecision(null);
  };

  const handleDecisionSelect = async (optionId: string) => {
    if (!activeConversation) return;
    try {
      await selectDecision({
        conversationId: activeConversation,
        optionId,
      });
    } catch (err) {
      console.error("Failed to select decision:", err);
    }
  };

  const friendsRecord = Object.fromEntries(
    FRIENDS.map((f) => [f.id, { name: f.name, color: f.color }])
  );

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
        </aside>

        {/* Landing center */}
        <div className="chat-landing">
          <h1 className="chat-landing-title">what&apos;s on your mind?</h1>
          <p className="chat-landing-sub">
            dump your messiest thought. your council of AI friends will hash it out.
          </p>

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

          {/* Provider status hint */}
          {providerList.length > 0 && (
            <div className="provider-status">
              {providerList.map((p) => (
                <span
                  key={p.name}
                  className={`provider-dot ${p.available ? "available" : "unavailable"}`}
                  title={p.available ? `${p.label} — ready` : `${p.label} — not configured`}
                >
                  <span className="provider-indicator" />
                  {p.label}
                </span>
              ))}
            </div>
          )}
        </div>
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
              {pod.map((f) => (
                <FriendPill key={f.id} friend={f} />
              ))}
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
          {activeProvider && (
            <span className="chat-header-provider" title="Active AI provider">
              via {activeProvider}
            </span>
          )}
        </div>

        <div className="chat-messages">
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              from={m.from}
              text={m.text}
              isUser={m.from === "user"}
            />
          ))}

          {typingAgents.length > 0 && (
            <TypingIndicator
              typingAgents={typingAgents}
              friends={friendsRecord}
            />
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
    </div>
  );
}
