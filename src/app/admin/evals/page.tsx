"use client";
import { useState, Fragment } from "react";
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

function ComparisonPanel({
  runA,
  runB,
  resultsA,
  resultsB,
}: {
  runA: any;
  runB: any;
  resultsA: any[];
  resultsB: any[];
}) {
  const avgCriteria = (results: any[]) => {
    const sums: Record<string, { total: number; count: number }> = {};
    for (const r of results) {
      try {
        const scores = JSON.parse(r.scores);
        for (const key of CRITERIA) {
          const entry = scores[key];
          if (entry && typeof entry === "object" && typeof entry.score === "number") {
            if (!sums[key]) sums[key] = { total: 0, count: 0 };
            sums[key].total += entry.score;
            sums[key].count++;
          }
        }
      } catch {}
    }
    const avgs: Record<string, number> = {};
    for (const [key, { total, count }] of Object.entries(sums)) {
      avgs[key] = count > 0 ? total / count : 0;
    }
    return avgs;
  };

  const avgsA = avgCriteria(resultsA);
  const avgsB = avgCriteria(resultsB);

  const overallDelta = (runB?.avgScore ?? 0) - (runA?.avgScore ?? 0);

  const promptDeltas = resultsB
    .map((rb) => {
      const ra = resultsA.find((a) => a.prompt === rb.prompt);
      return {
        prompt: rb.prompt,
        scoreA: ra?.overallScore ?? null,
        scoreB: rb.overallScore,
        delta: ra ? rb.overallScore - ra.overallScore : null,
      };
    })
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

  const deltaColor = (d: number) => {
    if (d > 0.3) return "var(--matcha-deep)";
    if (d < -0.3) return "#c0392b";
    return "var(--ink-faint)";
  };

  const deltaPrefix = (d: number) => (d > 0 ? "+" : "");

  return (
    <div className="comparison-panel">
      <h2 className="comparison-title">
        comparing{" "}
        <span className="comparison-run-name">{runA?.name}</span>
        {" vs "}
        <span className="comparison-run-name">{runB?.name}</span>
      </h2>

      <div className="comparison-overall" style={{ color: deltaColor(overallDelta) }}>
        overall: {deltaPrefix(overallDelta)}{overallDelta.toFixed(1)}
      </div>

      <table className="comparison-table">
        <thead>
          <tr>
            <th>criterion</th>
            <th>{runA?.name?.slice(-5) ?? "run a"}</th>
            <th>{runB?.name?.slice(-5) ?? "run b"}</th>
            <th>delta</th>
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((key) => {
            const a = avgsA[key] ?? 0;
            const b = avgsB[key] ?? 0;
            const d = b - a;
            return (
              <tr key={key}>
                <td className="comparison-criterion">{key}</td>
                <td className="comparison-score">{a.toFixed(1)}</td>
                <td className="comparison-score">{b.toFixed(1)}</td>
                <td className="comparison-delta" style={{ color: deltaColor(d) }}>
                  {deltaPrefix(d)}{d.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="comparison-prompts-title">per prompt</h3>
      <div className="comparison-prompts">
        {promptDeltas.map((p) => (
          <div key={p.prompt} className="comparison-prompt-row">
            <span className="comparison-prompt-text">{p.prompt}</span>
            <span className="comparison-prompt-scores">
              {p.scoreA ?? "—"} → {p.scoreB}
            </span>
            {p.delta !== null && (
              <span className="comparison-prompt-delta" style={{ color: deltaColor(p.delta) }}>
                {deltaPrefix(p.delta)}{p.delta.toFixed(1)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EvalsPage() {
  const runs = useQuery(api.evals.listRuns);
  const [selectedRunId, setSelectedRunId] = useState<Id<"evalRuns"> | null>(
    null
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ completed: number; total: number } | null>(null);
  const [compareIds, setCompareIds] = useState<Set<Id<"evalRuns">>>(new Set());

  const hasRunningRun = runs?.some((r) => r.status === "running") ?? false;

  const compareIdsArray = Array.from(compareIds);
  const compareResultsA = useQuery(
    api.evals.getRunResults,
    compareIdsArray[0] ? { evalRunId: compareIdsArray[0] } : "skip"
  );
  const compareResultsB = useQuery(
    api.evals.getRunResults,
    compareIdsArray[1] ? { evalRunId: compareIdsArray[1] } : "skip"
  );

  const results = useQuery(
    api.evals.getRunResults,
    selectedRunId ? { evalRunId: selectedRunId } : "skip"
  );

  const handleRunEvals = async () => {
    setIsRunning(true);
    setRunProgress(null);

    try {
      const response = await fetch("/api/run-evals", { method: "POST" });
      if (!response.ok || !response.body) {
        throw new Error("Failed to start eval run");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "progress" || data.type === "error") {
              setRunProgress({ completed: data.completed, total: data.total });
            }
            if (data.type === "done" || data.type === "fatal") {
              setIsRunning(false);
              setRunProgress(null);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Eval run failed:", err);
    } finally {
      setIsRunning(false);
      setRunProgress(null);
    }
  };

  const toggleCompare = (id: Id<"evalRuns">, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

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
      <div className="evals-header">
        <h1 className="evals-title">eval runs</h1>
        <button
          className="evals-run-btn"
          onClick={handleRunEvals}
          disabled={isRunning || hasRunningRun}
        >
          {isRunning && runProgress
            ? `running... (${runProgress.completed}/${runProgress.total})`
            : isRunning
              ? "starting..."
              : "run evals"}
        </button>
      </div>

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
              <input
                type="checkbox"
                className="eval-compare-check"
                checked={compareIds.has(run._id)}
                onChange={() => {}}
                onClick={(e) => toggleCompare(run._id, e)}
                disabled={!compareIds.has(run._id) && compareIds.size >= 2}
              />
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

      {/* Comparison panel */}
      {compareIds.size === 2 && compareResultsA && compareResultsB && (
        <ComparisonPanel
          runA={runs?.find((r) => r._id === compareIdsArray[0])}
          runB={runs?.find((r) => r._id === compareIdsArray[1])}
          resultsA={compareResultsA}
          resultsB={compareResultsB}
        />
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
                    <Fragment key={result._id}>
                      <tr
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
                    </Fragment>
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
