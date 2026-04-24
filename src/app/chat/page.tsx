"use client";

import { Component, type ReactNode } from "react";
import ChatPage from "./chat-page";

class ChatErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ChatErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#F4F1E8",
            color: "#1E1C16",
            fontFamily: "var(--font-body), system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-serif), serif",
              fontStyle: "italic",
              fontSize: 28,
              color: "#3E7A50",
              marginBottom: 16,
            }}
          >
            machax
          </div>
          <h2 style={{ fontSize: 24, margin: "0 0 12px", fontWeight: 600 }}>
            connecting to the pod...
          </h2>
          <p style={{ color: "#5A554A", maxWidth: 400, lineHeight: 1.5 }}>
            the backend is warming up. if this persists, make sure{" "}
            <code
              style={{
                background: "#ECE7D6",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              npx convex dev
            </code>{" "}
            is running.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "#1E1C16",
              color: "#F4F1E8",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function Page() {
  return (
    <ChatErrorBoundary>
      <ChatPage />
    </ChatErrorBoundary>
  );
}
