"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatPage from "./chat/chat-page";

const DEMO_MESSAGE_LIMIT = 2;

export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem("machax-user");
    if (user) {
      try {
        const parsed = JSON.parse(user);
        if (parsed?.username) {
          router.push("/chat");
          return;
        }
      } catch {}
    }
    // Demo messages exhausted — go straight to login
    try {
      const demo = localStorage.getItem("machax-demo");
      if (demo) {
        const parsed = JSON.parse(demo);
        if (parsed?.messageCount >= DEMO_MESSAGE_LIMIT) {
          router.push("/login");
          return;
        }
      }
    } catch {}
    // No logged-in user, demo still available — show demo chat
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return <ChatPage demoMode />;
}
