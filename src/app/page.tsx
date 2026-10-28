"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/api";

// Entry point: signed-in users go to chat, everyone else signs in first.
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getStoredUser() ? "/chat" : "/login");
  }, [router]);

  return null;
}
