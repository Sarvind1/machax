"use client";

import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";

interface AgentPresenceProps {
  podFriendIds: string[];
  friends: Record<string, { name: string; color: string }>;
  typingAgentIds?: string[];
}

export interface AgentPresenceHandle {
  getOnlineIds: () => string[];
  isOnline: (id: string) => boolean;
}

const AgentPresence = forwardRef<AgentPresenceHandle, AgentPresenceProps>(
  function AgentPresence({ podFriendIds, friends, typingAgentIds = [] }, ref) {
    const [onlineSet, setOnlineSet] = useState<Set<string>>(new Set());
    const initializedRef = useRef(false);

    // On mount (or when pod changes), randomly assign ~60% as online
    useEffect(() => {
      if (podFriendIds.length === 0) return;
      const next = new Set<string>();
      for (const id of podFriendIds) {
        if (Math.random() < 0.6) next.add(id);
      }
      // Ensure at least one is online if pod is non-empty
      if (next.size === 0 && podFriendIds.length > 0) {
        next.add(podFriendIds[Math.floor(Math.random() * podFriendIds.length)]);
      }
      setOnlineSet(next);
      initializedRef.current = true;
    }, [podFriendIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    // Periodically flip one random agent's status every 30-60s
    useEffect(() => {
      if (podFriendIds.length === 0) return;

      const scheduleFlip = () => {
        const delay = 30000 + Math.random() * 30000;
        return setTimeout(() => {
          const target =
            podFriendIds[Math.floor(Math.random() * podFriendIds.length)];
          setOnlineSet((prev) => {
            const next = new Set(prev);
            if (next.has(target)) {
              next.delete(target);
            } else {
              next.add(target);
            }
            return next;
          });
          timerRef.current = scheduleFlip();
        }, delay);
      };

      const timerRef = { current: scheduleFlip() };
      return () => clearTimeout(timerRef.current);
    }, [podFriendIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    // Merge typing agents into the effective online set
    const effectiveOnline = useCallback(
      (id: string) => onlineSet.has(id) || typingAgentIds.includes(id),
      [onlineSet, typingAgentIds]
    );

    useImperativeHandle(
      ref,
      () => ({
        getOnlineIds: () =>
          podFriendIds.filter((id) => effectiveOnline(id)),
        isOnline: (id: string) => effectiveOnline(id),
      }),
      [podFriendIds, effectiveOnline]
    );

    if (podFriendIds.length === 0) return null;

    return (
      <div className="presence-row">
        {podFriendIds.map((id) => {
          const f = friends[id];
          if (!f) return null;
          const online = effectiveOnline(id);
          return (
            <span
              key={id}
              className="presence-pill"
              style={{
                background: `${f.color}18`,
                color: f.color,
              }}
            >
              <span
                className={`presence-dot ${online ? "presence-online" : "presence-away"}`}
              />
              {f.name.toLowerCase()}
            </span>
          );
        })}
      </div>
    );
  }
);

export default AgentPresence;
