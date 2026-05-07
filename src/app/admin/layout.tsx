"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const ADMIN_USERNAME = "sarvind";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "unauthorized" | "admin">("checking");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("machax-user");
      if (!stored) {
        router.push("/");
        return;
      }
      const parsed = JSON.parse(stored);
      if (parsed?.username === ADMIN_USERNAME) {
        setAuthState("admin");
      } else {
        setAuthState("unauthorized");
      }
    } catch {
      router.push("/");
    }
  }, [router]);

  if (authState === "checking") {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F4F1E8",
        color: "#5A554A",
        fontFamily: "var(--font-body), system-ui, sans-serif",
      }}>
        <p>checking access...</p>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        background: "#F4F1E8",
        color: "#5A554A",
        fontFamily: "var(--font-body), system-ui, sans-serif",
        gap: "12px",
      }}>
        <p style={{ fontSize: "18px" }}>unauthorized</p>
        <p style={{ fontSize: "13px", color: "#8a8478" }}>
          admin access is required to view this page.
        </p>
        <a
          href="/"
          style={{
            marginTop: "8px",
            fontSize: "13px",
            color: "#6B8F71",
            textDecoration: "underline",
          }}
        >
          back to home
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
