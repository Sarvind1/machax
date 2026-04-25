"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DecisionsPage({ userName }: { userName: string }) {
  const decisions = useQuery(api.decisions.listByUser, { username: userName });

  const page: React.CSSProperties = {
    minHeight: "100vh", background: "#F4F1E8", color: "#1E1C16",
    fontFamily: "var(--font-body), system-ui, sans-serif",
    padding: "2rem 1rem",
  };
  const container: React.CSSProperties = { maxWidth: 720, margin: "0 auto" };
  const header: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    marginBottom: "2rem",
  };
  const logo: React.CSSProperties = {
    fontFamily: "var(--font-caveat), cursive", fontSize: "1.5rem",
    color: "#6BAE7E", textDecoration: "none",
  };
  const backLink: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace", fontSize: "0.8rem",
    color: "#8A8374", textDecoration: "none",
  };
  const title: React.CSSProperties = {
    fontFamily: "var(--font-serif), Georgia, serif", fontStyle: "italic",
    fontSize: "1.6rem", color: "#1E1C16", margin: "0 0 1.5rem",
  };
  const card: React.CSSProperties = {
    borderLeft: "3px solid #6BAE7E", padding: "1rem 1rem 1rem 1.25rem",
    marginBottom: "1.25rem", background: "rgba(255,255,255,0.4)",
    borderRadius: "0 8px 8px 0",
  };
  const convTitle: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem",
    color: "#8A8374", margin: "0 0 0.35rem", textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
  const question: React.CSSProperties = {
    fontFamily: "var(--font-serif), Georgia, serif", fontStyle: "italic",
    fontSize: "1.1rem", color: "#1E1C16", margin: "0 0 0.6rem",
  };
  const chosenLabel: React.CSSProperties = {
    fontWeight: 700, color: "#3E7A50", margin: "0 0 0.15rem",
    fontSize: "0.95rem",
  };
  const chosenBlurb: React.CSSProperties = {
    color: "#5A554A", fontSize: "0.88rem", margin: "0 0 0.35rem",
    lineHeight: 1.45,
  };
  const time: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem",
    color: "#8A8374",
  };
  const empty: React.CSSProperties = {
    textAlign: "center", color: "#8A8374", marginTop: "4rem",
    fontFamily: "var(--font-serif), Georgia, serif", fontStyle: "italic",
    fontSize: "1.1rem",
  };

  return (
    <div style={page}>
      <div style={container}>
        <div style={header}>
          <Link href="/chat" style={logo}>machaX</Link>
          <Link href="/chat" style={backLink}>back to chat</Link>
        </div>
        <h1 style={title}>your decisions</h1>

        {!decisions ? (
          <p style={{ color: "#8A8374" }}>loading...</p>
        ) : decisions.length === 0 ? (
          <p style={empty}>no decisions yet -- start a chat and pick a card</p>
        ) : (
          decisions.map((d, i) => (
            <div key={d.conversationId} style={card}>
              <p style={convTitle}>{d.conversationTitle}</p>
              <p style={question}>{d.question}</p>
              {d.selectedOption && (
                <>
                  <p style={chosenLabel}>{d.selectedOption.label}</p>
                  <p style={chosenBlurb}>{d.selectedOption.blurb}</p>
                </>
              )}
              <span style={time}>{timeAgo(d.decidedAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
