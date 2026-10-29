"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { isHomePath, runBackHandlers } from "@/lib/back-nav";

// Previous page if there is one in this app session, else the chat home.
export function goBack(router: ReturnType<typeof useRouter>): void {
  if (window.history.length > 1) router.back();
  else router.replace("/chat");
}

// Android back button/gesture. Once a listener exists, Capacitor no longer
// closes the app by itself, so the home screen has to call exitApp.
export function AndroidBackHandler() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = App.addListener("backButton", () => {
      if (runBackHandlers()) return;
      if (isHomePath(window.location.pathname)) {
        void App.exitApp();
        return;
      }
      goBack(router);
    });
    return () => {
      void sub.then((s) => s.remove());
    };
  }, [router]);
  return null;
}

// The on-screen back arrow. onClick overrides the default (previous page).
export default function BackArrow({ onClick, style }: { onClick?: () => void; style?: React.CSSProperties }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="back"
      className="back-arrow"
      onClick={onClick ?? (() => goBack(router))}
      style={{
        background: "none",
        border: "none",
        padding: "4px 8px 4px 0",
        fontSize: 22,
        lineHeight: 1,
        color: "inherit",
        cursor: "pointer",
        ...style,
      }}
    >
      &larr;
    </button>
  );
}
