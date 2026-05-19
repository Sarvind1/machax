"use client";

import { useState, useEffect } from "react";
import HomePage from "../home-page";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export default function LandingClient() {
  const [locale, setLocale] = useState<"in" | "global">("in");

  useEffect(() => {
    const geo = getCookie("geo") ?? "in";
    setLocale(geo === "in" ? "in" : "global");
  }, []);

  return <HomePage locale={locale} />;
}
