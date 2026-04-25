"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FRIENDS_BY_ID } from "@/lib/friends";
import "./admin-evals.css";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score < 5) return "#c0392b";
  if (score <= 7) return "#d4a017";
  return "var(--matcha-deep)";
}

function barColor(score: number): string {
  if (score < 5) return "#c0392b";
  if (score <= 7) return "#d4a017";
  return "var(--matcha)";
}

interface ParsedScores {
  [key: string]: { score: number; note: string } | number;
  overall: number;
}

const CRITERIA = [
  "naturalness",
  "relevance",
  "engagement",
  "variety",
  "pacing",
  "length",
  "completeness",
  "entertainment",
];

export default function EvalsPage() {
  const runs = useQuery(api.evals.listRuns);
  const [selectedRunId, setSelectedRunId] = useState<Id<"evalRuns"> | null>(
    null
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const results = useQuery(
    api.evals.getRunResults,
    selectedRunId ? { evalRunId: selectedRunId } : "skip"
  );

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parseScores = (raw: string): ParsedScores | null => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const parseMessages = (
    raw: string
  ): { from: string; text: string }[] | null => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  return (
    <div className="evals-page">
      <h1 className="evals-title">eval runs</h1>

      {/* Run cards */}
      {runs === undefined ? (
        <div className="evals-loading">loading runs...</div>
      ) : runs.length === 0 ? (
        <div className="evals-empty">no eval runs yet</div>
      ) : (
        <div className="evals-runs">
          {runs.map((run) => (
            <div
              key={run._id}
              className={`eval-run-card ${selectedRunId === run._id ? "selected" : ""}`}
              onClick={() => {
                setSelectedRunId(run._id);
                setExpandedRows(new Set());
              }}
            >
              <span className="eval-run-name">{run.name}</span>
              <span
                className={`eval-run-badge ${run.status === "running" ? "running" : run.status === "complete" ? "complete" : "failed"}`}
              >
                {run.status}
              </span>
              <span className="eval-run-prompts">
                {run.promptCount} prompts
              </span>
              {run.avgScore != null && (
                <span
                  className="eval-run-score"
                  style={{ color: scoreColor(run.avgScore) }}
                >
                  {run.avgScore.toFixed(1)}
                </span>
              )}
              <span className="eval-run-time">{timeAgo(run.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results detail */}
      {selectedRunId && (
        <div className="evals-results-section">
          <h2 className="evals-results-title">results</h2>
          {results === undefined ? (
            <div className="evals-loading">loading results...</div>
          ) : results.length === 0 ? (
            <div className="evals-results-empty">
              no results for this run yet
            </div>
          ) : (
            <table className="evals-results-table">
              <thead>
                <tr>
                  <th>prompt</th>
                  <th>score</th>
                  <th>msgs</th>
                  <th>time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const isExpanded = expandedRows.has(result._id);
                  const scores = parseScores(result.scores);
                  const messages = parseMessages(result.messages);
                  const timeSec = (result.totalTimeMs / 1000).toFixed(1);

                  return (
                    <>
                      <tr
                        key={result._id}
                        className="result-row"
                        onClick={() => toggleRow(result._id)}
                      >
                        <td className="result-prompt">{result.prompt}</td>
                        <td
                          className="result-score"
                          style={{
                            color: scoreColor(result.overallScore),
                          }}
                        >
                          {result.overallScore}
                        </td>
                        <td className="result-msgs">
                          {result.messageCount}
                        </td>
                        <td className="result-time">{timeSec}s</td>
                      </tr>
                      {isExpanded && (
                        <tr
                          key={`${result._id}-detail`}
                          className="result-detail"
                        >
                          <td colSpan={4}>
                            <div className="detail-inner">
                              {/* Score breakdown */}
                              {scores && (
                                <div>
                                  <h3 className="score-breakdown-title">
                                    score breakdown
                                  </h3>
                                  <div className="score-criteria">
                                    {CRITERIA.map((key) => {
                                      const entry = scores[key];
                                      if (
                                        !entry ||
                                        typeof entry !== "object"
                                      )
                                        return null;
                                      const { score, note } = entry as {
                                        score: number;
                                        note: string;
                                      };
                                      return (
                                        <div
                                          key={key}
                                          className="score-criterion"
                                        >
                                          <div className="score-criterion-row">
                                            <span className="score-criterion-label">
                                              {key}
                                            </span>
                                            <div className="score-bar">
                                              {Array.from(
                                                { length: 10 },
                                                (_, i) => (
                                                  <div
                                                    key={i}
                                                    className="score-bar-segment"
                                                    style={{
                                                      background:
                                                        i < score
                                                          ? barColor(score)
                                                          : "transparent",
                                                    }}
                                                  />
                                                )
                                              )}
                                            </div>
                                            <span
                                              className="score-criterion-value"
                                              style={{
                                                color: scoreColor(score),
                                              }}
                                            >
                                              {score}
                                            </span>
                                          </div>
                                          {note && (
                                            <div className="score-criterion-note">
                                              {note}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Transcript */}
                              {messages && messages.length > 0 && (
                                <div>
                                  <h3 className="transcript-title">
                                    conversation
                                  </h3>
                                  <div className="transcript-messages">
                                    {messages.map((msg, i) => {
                                      const friend =
                                        FRIENDS_BY_ID[msg.from];
                                      const isUser =
                                        msg.from === "user" ||
                                        msg.from === "you";
                                      const borderColor =
                                        isUser
                                          ? "var(--matcha)"
                                          : friend?.color || "#999";
                                      const nameColor =
                                        friend?.color || "#999";

                                      return (
                                        <div
                                          key={i}
                                          className={`transcript-msg ${isUser ? "user-msg" : ""}`}
                                          style={{
                                            borderLeftColor: borderColor,
                                          }}
                                        >
                                          <span
                                            className="transcript-msg-from"
                                            style={{
                                              color: isUser
                                                ? "var(--matcha-deep)"
                                                : nameColor,
                                            }}
                                          >
                                            {isUser
                                              ? "you"
                                              : friend?.name ||
                                                msg.from}
                                          </span>
                                          <span className="transcript-msg-text">
                                            {msg.text}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
