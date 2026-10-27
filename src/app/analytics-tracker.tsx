"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { logScreen, setAnalyticsUser } from "@/lib/analytics";

// Logs a screen_view on every route change, and re-applies user_id for users who were
// already logged in before analytics shipped.
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const username = JSON.parse(localStorage.getItem("machax-user") ?? "null")?.username;
      if (username) setAnalyticsUser(username);
    } catch {}
  }, []);

  useEffect(() => {
    if (pathname) logScreen(pathname);
  }, [pathname]);

  return null;
}
