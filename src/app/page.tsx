"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/stored-user";

// Entry point: a cached user goes to chat, everyone else signs in first.
// /login re-checks the Firebase session, so a stale cache cannot loop.
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getStoredUser() ? "/chat" : "/login");
  }, [router]);

  return null;
}
