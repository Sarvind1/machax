"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Entry point: everyone lands in chat. Signed-out users chat as guests and are
// asked to sign in once their free messages run out (see chat-page.tsx).
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  return null;
}
