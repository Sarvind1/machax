"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FRIENDS_BY_ID } from "@/lib/friends";
import "./admin-traces.css";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TracesPage() {
  const [selectedId, setSelectedId] = useState<Id<"traces"> | null>(null);

  const traces = useQuery(api.traces.list);
  const selectedTrace = useQuery(
    api.traces.get,
    selectedId ? { id: selectedId } : "skip"
  );

  return (
    <div className="traces-page">
      {/* Left panel — trace list */}
      <div className="traces-list">
        <h1 className="traces-list-header">traces</h1>

        {traces === undefined && (
          <div className="traces-loading">loading...</div>
        )}

        {traces && traces.length === 0 && (
          <div className="traces-list-empty">no traces yet</div>
        )}

        {traces?.map((t) => (
          <div
            key={t._id}
            className={`trace-row${selectedId === t._id ? " selected" : ""}`}
            onClick={() => setSelectedId(t._id)}
          >
            <p className="trace-row-prompt">
              {t.prompt.length > 50
                ? t.prompt.slice(0, 50) + "..."
                : t.prompt}
            </p>
            <div className="trace-row-meta">
              <span>{timeAgo(t.createdAt)}</span>
              <span className="trace-badge">{t.totalMessages} msgs</span>
              <span>{t.provider}</span>
              <span>{(t.totalTimeMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right panel — trace detail */}
      <div className="traces-detail">
        {!selectedId && (
          <div className="traces-detail-empty">select a trace</div>
        )}

        {selectedId && selectedTrace === undefined && (
          <div className="traces-loading">loading trace...</div>
        )}

        {selectedTrace && <TraceDetail trace={selectedTrace} />}
      </div>
    </div>
  );
}

interface Iteration {
  iteration: number;
  energyBefore: number;
  energyAfter: number;
  selected: {
    agentId: string;
    score: number;
    target?: { name: string; text: string };
    response?: string;
  }[];
  skipped?: string[];
}

function TraceDetail({ trace }: { trace: Record<string, unknown> }) {
  const iterations: Iteration[] = (() => {
    try {
      return JSON.parse(trace.iterations as string);
    } catch {
      return [];
    }
  })();

  const podFriendIds = (trace.podFriendIds as string[]) || [];

  return (
    <>
      <h2 className="trace-header-prompt">{trace.prompt as string}</h2>

      {/* Pod */}
      <div className="trace-pod">
        {podFriendIds.map((id) => {
          const friend = FRIENDS_BY_ID[id];
          return (
            <span key={id} className="trace-pod-pill">
              <span
                className="trace-pod-dot"
                style={{ background: friend?.color ?? "#999" }}
              />
              {friend?.name ?? id}
            </span>
          );
        })}
      </div>

      {/* Stats */}
      <div className="trace-stats">
        <div className="trace-stat-box">
          <p className="trace-stat-value">
            {((trace.totalTimeMs as number) / 1000).toFixed(1)}s
          </p>
          <p className="trace-stat-label">total time</p>
        </div>
        <div className="trace-stat-box">
          <p className="trace-stat-value">
            {trace.totalIterations as number}
          </p>
          <p className="trace-stat-label">iterations</p>
        </div>
        <div className="trace-stat-box">
          <p className="trace-stat-value">
            {trace.totalMessages as number}
          </p>
          <p className="trace-stat-label">messages</p>
        </div>
        <div className="trace-stat-box">
          <p className="trace-stat-value">
            {trace.finalEnergy as number}
          </p>
          <p className="trace-stat-label">final energy</p>
        </div>
      </div>

      {/* Iteration timeline */}
      <h3 className="trace-iterations-title">iteration timeline</h3>
      {iterations.map((iter) => (
        <div key={iter.iteration} className="trace-iteration">
          <div className="trace-iter-header">
            <span className="trace-iter-label">#{iter.iteration}</span>
            <div className="trace-energy-bar-bg">
              <div
                className="trace-energy-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, iter.energyAfter))}%` }}
              />
            </div>
            <span className="trace-energy-value">{iter.energyAfter}%</span>
          </div>

          {iter.selected?.map((agent, i) => {
            const friend = FRIENDS_BY_ID[agent.agentId];
            return (
              <div key={i} className="trace-agent">
                <div className="trace-agent-header">
                  <span className="trace-agent-pill">
                    <span
                      className="trace-agent-dot"
                      style={{ background: friend?.color ?? "#999" }}
                    />
                    {friend?.name ?? agent.agentId}
                  </span>
                  <span className="trace-agent-score">
                    {agent.score.toFixed(1)}
                  </span>
                </div>
                {agent.target && (
                  <p className="trace-agent-target">
                    replying to {agent.target.name}:{" "}
                    {agent.target.text.length > 80
                      ? agent.target.text.slice(0, 80) + "..."
                      : agent.target.text}
                  </p>
                )}
                {agent.response && (
                  <p className="trace-agent-response">{agent.response}</p>
                )}
              </div>
            );
          })}

          {iter.skipped && iter.skipped.length > 0 && (
            <div className="trace-skipped">
              skipped:{" "}
              {iter.skipped
                .map((id) => FRIENDS_BY_ID[id]?.name ?? id)
                .join(", ")}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
