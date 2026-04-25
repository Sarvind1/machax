"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConfigurePage from "./configure-page";

export default function Page() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("machax-user");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      setUserName(parsed?.username || null);
    } catch {
      router.push("/");
    }
  }, [router]);

  if (!userName) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F4F1E8", color: "#5A554A", fontFamily: "var(--font-body), system-ui, sans-serif",
      }}>
        <p>loading...</p>
      </div>
    );
  }

  return <ConfigurePage userName={userName} />;
}
