"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FRIENDS, FRIENDS_BY_ID } from "@/lib/friends";
import type { Friend } from "@/lib/friends";
import { ATTENTION_WINDOWS } from "@/lib/engine-types";
import type { AgentTraits } from "@/lib/engine-types";
import "./configure.css";

// ── Core characters ──────────────────────────────────────────────────
const CORE_IDS = [
  "priya", "divya", "meera", "arjun", "tanmay", "noor",
  "pradeep", "suresh", "lalitha", "farhan", "sneha", "dev", "shekhar",
];
const coreCharacters = CORE_IDS.map((id) => FRIENDS_BY_ID[id]).filter(Boolean);

const DEFAULT_POD = ["priya", "farhan", "meera", "dev", "suresh"];
const DEFAULT_POD_SIZE = 5;

// ── Profile data ──────────────────────────────────────────────────────
const PROFILES: Record<string, { age: number; gender: string; city: string; job: string }> = {
  priya:   { age: 26, gender: "F", city: "Mumbai",    job: "Content writer" },
  divya:   { age: 27, gender: "F", city: "Bangalore", job: "UX researcher" },
  meera:   { age: 24, gender: "F", city: "Delhi",     job: "Startup marketing" },
  arjun:   { age: 28, gender: "M", city: "Bangalore", job: "Product manager" },
  tanmay:  { age: 25, gender: "M", city: "Pune",      job: "Data analyst" },
  noor:    { age: 27, gender: "F", city: "Hyderabad", job: "Finance analyst" },
  pradeep: { age: 29, gender: "M", city: "Bangalore", job: "Operations manager" },
  suresh:  { age: 32, gender: "M", city: "Chennai",   job: "Ex-founder, corporate" },
  lalitha: { age: 26, gender: "F", city: "Bangalore", job: "Project manager" },
  farhan:  { age: 26, gender: "M", city: "Mumbai",    job: "Freelance journalist" },
  sneha:   { age: 28, gender: "F", city: "Delhi",     job: "Therapist" },
  dev:     { age: 25, gender: "M", city: "Bangalore", job: "Backend developer" },
  shekhar: { age: 29, gender: "M", city: "Mumbai",    job: "Lawyer" },
};

// ── All available tags ────────────────────────────────────────────────
const ALL_TAGS = Array.from(new Set(FRIENDS.flatMap((f) => f.tags))).sort();

// ── Types ─────────────────────────────────────────────────────────────
interface CharacterOverride {
  active?: boolean;
  agreementBias?: number;
  responseSpeed?: AgentTraits["responseSpeed"];
  lurkerChance?: number;
  verbosityRange?: [number, number];
  tangentProbability?: number;
  attentionWindow?: number;
  tags?: string[];
}

interface GroupSettings {
  podSize: number;
  depth: string;
  engagement: number;
}

// ── Helpers ───────────────────────────────────────────────────────────
function getOverride(overrides: Record<string, CharacterOverride>, id: string): CharacterOverride {
  return overrides[id] ?? {};
}

function getTraitValue<K extends keyof AgentTraits>(
  friend: Friend,
  overrides: Record<string, CharacterOverride>,
  key: K,
): AgentTraits[K] {
  const ov = overrides[friend.id];
  if (ov && key in ov) return (ov as Record<string, unknown>)[key] as AgentTraits[K];
  return friend.traits[key];
}

function getAttentionNormalized(friend: Friend, overrides: Record<string, CharacterOverride>): number {
  const ov = overrides[friend.id];
  if (ov?.attentionWindow != null) {
    return Math.min(ov.attentionWindow / 20, 1);
  }
  const speed = getTraitValue(friend, overrides, "responseSpeed") ?? "normal";
  const w = friend.traits.attentionWindow ?? ATTENTION_WINDOWS[speed];
  return Math.min(w / 20, 1);
}

// Derive selectedPod from overrides
function derivePod(overrides: Record<string, CharacterOverride>): string[] {
  // Characters with explicit active: true, or in CORE_IDS without active: false
  const pod: string[] = [];
  for (const id of CORE_IDS) {
    const ov = overrides[id];
    if (ov?.active === true) {
      pod.push(id);
    } else if (ov?.active === undefined || ov === undefined) {
      // If no override, check if in default pod
      if (DEFAULT_POD.includes(id)) pod.push(id);
    }
    // active === false means not in pod
  }
  return pod;
}

// ── Component ─────────────────────────────────────────────────────────
export default function ConfigurePage({ userName }: { userName: string }) {
  const savedSettings = useQuery(api.settings.get, { username: userName });
  const saveSettings = useMutation(api.settings.save);

  const [characterOverrides, setCharacterOverrides] = useState<Record<string, CharacterOverride>>({});
  const [selectedPod, setSelectedPod] = useState<string[]>(DEFAULT_POD);
  const [podSize, setPodSize] = useState<number>(DEFAULT_POD_SIZE);
  const [tuningTab, setTuningTab] = useState<string>(DEFAULT_POD[0]);
  const [groupSettings, setGroupSettings] = useState<GroupSettings>({
    podSize: DEFAULT_POD_SIZE, depth: "normal", engagement: 0.4,
  });
  const [groupOpen, setGroupOpen] = useState(false);

  const loaded = useRef(false);
  const initializing = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from Convex once (savedSettings can be null for first-time users — that's fine, use defaults)
  useEffect(() => {
    if (loaded.current) return;
    // For Convex useQuery: undefined means still loading, null means no record found
    if (savedSettings === undefined) return; // still loading, wait
    loaded.current = true;
    initializing.current = true;
    if (!savedSettings) {
      // First-time user — use defaults, enable auto-save
      setTimeout(() => { initializing.current = false; }, 0);
      return;
    }

    let ovs: Record<string, CharacterOverride> = {};
    if (savedSettings.characterOverrides) {
      try {
        ovs = JSON.parse(savedSettings.characterOverrides);
      } catch { /* keep defaults */ }
    }
    setCharacterOverrides(ovs);

    const loadedPod = derivePod(ovs);
    setSelectedPod(loadedPod.length > 0 ? loadedPod : DEFAULT_POD);

    const ps = savedSettings.podSize ?? DEFAULT_POD_SIZE;
    setPodSize(ps);
    setGroupSettings((s) => ({ ...s, podSize: ps }));

    if (savedSettings.conversationDepth) {
      setGroupSettings((s) => ({ ...s, depth: savedSettings.conversationDepth ?? s.depth }));
    }
    if (savedSettings.userEngagementFrequency != null) {
      setGroupSettings((s) => ({ ...s, engagement: savedSettings.userEngagementFrequency ?? s.engagement }));
    }

    if (loadedPod.length > 0) {
      setTuningTab(loadedPod[0]);
    }

    setTimeout(() => { initializing.current = false; }, 0);
  }, [savedSettings]);

  // Sync overrides active field with selectedPod
  const syncOverridesWithPod = useCallback((pod: string[], prevOverrides: Record<string, CharacterOverride>) => {
    const next = { ...prevOverrides };
    for (const id of CORE_IDS) {
      const inPod = pod.includes(id);
      next[id] = { ...next[id], active: inPod };
    }
    return next;
  }, []);

  // Auto-save (debounced)
  const doSave = useCallback(() => {
    const ovsWithActive = syncOverridesWithPod(selectedPod, characterOverrides);
    saveSettings({
      username: userName,
      characterOverrides: JSON.stringify(ovsWithActive),
      podSize: groupSettings.podSize,
      conversationDepth: groupSettings.depth,
      userEngagementFrequency: groupSettings.engagement,
    });
  }, [saveSettings, userName, characterOverrides, selectedPod, groupSettings, syncOverridesWithPod]);

  useEffect(() => {
    if (!loaded.current || initializing.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [doSave]);

  // ── Updaters ──────────────────────────────────────────────────────
  const updateOverride = (id: string, patch: Partial<CharacterOverride>) => {
    setCharacterOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleCharacter = (id: string) => {
    setSelectedPod((prev) => {
      if (prev.includes(id)) {
        // Remove from pod
        const next = prev.filter((p) => p !== id);
        // If we removed the active tuning tab, switch to first remaining
        if (tuningTab === id && next.length > 0) {
          setTuningTab(next[0]);
        }
        return next;
      } else {
        // Add to pod — respect podSize cap
        if (prev.length >= podSize) return prev;
        return [...prev, id];
      }
    });
  };

  const changePodSize = (newSize: number) => {
    setPodSize(newSize);
    setGroupSettings((s) => ({ ...s, podSize: newSize }));
    // Auto-truncate if current selection exceeds new size
    setSelectedPod((prev) => {
      if (prev.length > newSize) {
        const trimmed = prev.slice(0, newSize);
        if (!trimmed.includes(tuningTab) && trimmed.length > 0) {
          setTuningTab(trimmed[0]);
        }
        return trimmed;
      }
      return prev;
    });
  };

  const resetDefaults = () => {
    setCharacterOverrides({});
    setSelectedPod(DEFAULT_POD);
    setPodSize(DEFAULT_POD_SIZE);
    setTuningTab(DEFAULT_POD[0]);
    setGroupSettings({ podSize: DEFAULT_POD_SIZE, depth: "normal", engagement: 0.4 });
  };

  // ── Tuning tab character ──────────────────────────────────────────
  // Ensure tuningTab is valid
  const effectiveTab = selectedPod.includes(tuningTab) ? tuningTab : (selectedPod[0] ?? "priya");
  const tuneChar = FRIENDS_BY_ID[effectiveTab];
  const tuneProfile = PROFILES[effectiveTab];
  const overrides = characterOverrides;

  if (!tuneChar) return null;

  // Current trait values for tuning tab character
  const agreementBias = (getTraitValue(tuneChar, overrides, "agreementBias") ?? 0) as number;
  const responseSpeed = (getTraitValue(tuneChar, overrides, "responseSpeed") ?? "normal") as AgentTraits["responseSpeed"];
  const lurkerChance = (getTraitValue(tuneChar, overrides, "lurkerChance") ?? 0.1) as number;
  const chattiness = 1 - lurkerChance;
  const verbosityRange = (getTraitValue(tuneChar, overrides, "verbosityRange") ?? [5, 30]) as [number, number];
  const tangentProb = (getTraitValue(tuneChar, overrides, "tangentProbability") ?? tuneChar.traits.tangentProbability ?? 0) as number;
  const attentionNorm = getAttentionNormalized(tuneChar, overrides);
  const activeTags = getOverride(overrides, effectiveTab).tags ?? tuneChar.tags;

  const podFull = selectedPod.length >= podSize;

  return (
    <div className="config-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="config-header">
        <p className="config-wordmark">macha<em>x</em> &middot; configure your pod</p>
        <p className="config-subtitle">tune the people in your group chat.</p>
      </header>

      <div className="config-main">
        {/* ── STEP 1: Pick Your Pod ────────────────────────────── */}
        <section className="config-section">
          <div className="config-section-header">
            <span className="config-section-num">01</span>
            <h2 className="config-section-title">pick your pod</h2>
          </div>
          <hr className="config-section-rule" />

          <div className="config-card-grid">
            {coreCharacters.map((f) => {
              const isSelected = selectedPod.includes(f.id);
              const isDisabled = !isSelected && podFull;
              return (
                <div
                  key={f.id}
                  className="config-char-card"
                  onClick={() => !isDisabled && toggleCharacter(f.id)}
                  data-selected={isSelected}
                  data-disabled={isDisabled}
                >
                  <div className="config-char-avatar" style={{ background: f.color }}>
                    {f.name[0]}
                    {isSelected && <div className="config-char-check">&#10003;</div>}
                  </div>
                  <div className="config-char-name">{f.name.split(" ")[0].toLowerCase()}</div>
                  <div className="config-char-role">{f.role}</div>
                </div>
              );
            })}
          </div>

          <div className="config-pod-bar">
            <span className="config-pod-bar-label">pod size:</span>
            <div className="config-segmented">
              {[3, 5, 7, 9].map((n) => (
                <button
                  key={n}
                  className={`config-seg-btn${podSize === n ? " config-seg-btn--active" : ""}`}
                  onClick={() => changePodSize(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {podFull ? (
              <span className="config-pod-full">pod is full — remove someone first</span>
            ) : (
              <span className="config-pod-counter">{selectedPod.length}/{podSize} selected</span>
            )}
          </div>
        </section>

        {/* ── STEP 2: Tune Your People ─────────────────────────── */}
        {selectedPod.length > 0 && (
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">02</span>
              <h2 className="config-section-title">tune your people</h2>
            </div>
            <hr className="config-section-rule" />

            {/* Character tabs */}
            <div className="config-tune-tabs">
              {selectedPod.map((id) => {
                const f = FRIENDS_BY_ID[id];
                if (!f) return null;
                return (
                  <button
                    key={id}
                    className={`config-tune-tab${effectiveTab === id ? " config-tune-tab--active" : ""}`}
                    onClick={() => setTuningTab(id)}
                  >
                    <span className="config-tune-tab-avatar" style={{ background: f.color }}>
                      {f.name[0]}
                    </span>
                    <span className="config-tune-tab-name">{f.name.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Tuning panel */}
            <div className="config-tune-panel">
              {tuneProfile && (
                <p className="config-tune-identity">
                  <strong>{tuneChar.name}</strong> &mdash; {tuneProfile.age}{tuneProfile.gender}, {tuneProfile.city}. {tuneProfile.job}.
                </p>
              )}

              {/* 3x2 dial grid */}
              <div className="config-dial-grid">
                {/* personality (bipolar) */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">personality</p>
                    <span className="config-dial-spec">{agreementBias > 0 ? "+" : ""}{agreementBias.toFixed(2)}</span>
                  </div>
                  <div className="config-bipolar">
                    <span className="config-bipolar-center" />
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={agreementBias}
                      onChange={(e) => updateOverride(effectiveTab, { agreementBias: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="config-bipolar-labels">
                    <span>contrarian</span>
                    <span>neutral</span>
                    <span>agreeable</span>
                  </div>
                </div>

                {/* reply speed (segmented) */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">reply speed</p>
                    <span className="config-dial-spec">{responseSpeed}</span>
                  </div>
                  <div className="config-segmented">
                    {(["impulsive", "normal", "thoughtful"] as const).map((s) => (
                      <button
                        key={s}
                        className={`config-seg-btn${responseSpeed === s ? " config-seg-btn--active" : ""}`}
                        onClick={() => updateOverride(effectiveTab, { responseSpeed: s })}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* chattiness */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">chattiness</p>
                    <span className="config-dial-spec">{Math.round(chattiness * 100)}%</span>
                  </div>
                  <div className="config-slider-wrap">
                    <input
                      type="range"
                      className="config-slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={chattiness}
                      onChange={(e) => updateOverride(effectiveTab, { lurkerChance: 1 - parseFloat(e.target.value) })}
                    />
                    <div className="config-slider-ticks">
                      <span>quiet</span>
                      <span>talkative</span>
                    </div>
                  </div>
                </div>

                {/* message length (range) */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">msg length</p>
                    <span className="config-dial-spec">{verbosityRange[0]}-{verbosityRange[1]}w</span>
                  </div>
                  <div className="config-range-wrap">
                    <div className="config-range-track" />
                    <div
                      className="config-range-fill"
                      style={{
                        left: `${(verbosityRange[0] / 50) * 100}%`,
                        width: `${((verbosityRange[1] - verbosityRange[0]) / 50) * 100}%`,
                      }}
                    />
                    <input
                      type="range"
                      className="config-range-input"
                      min={1}
                      max={50}
                      step={1}
                      value={verbosityRange[0]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v < verbosityRange[1]) {
                          updateOverride(effectiveTab, { verbosityRange: [v, verbosityRange[1]] });
                        }
                      }}
                    />
                    <input
                      type="range"
                      className="config-range-input"
                      min={1}
                      max={50}
                      step={1}
                      value={verbosityRange[1]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v > verbosityRange[0]) {
                          updateOverride(effectiveTab, { verbosityRange: [verbosityRange[0], v] });
                        }
                      }}
                    />
                  </div>
                  <div className="config-range-labels">
                    <span>1w</span>
                    <span>50w</span>
                  </div>
                </div>

                {/* tangents */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">tangents</p>
                    <span className="config-dial-spec">{Math.round(tangentProb * 100)}%</span>
                  </div>
                  <div className="config-slider-wrap">
                    <input
                      type="range"
                      className="config-slider"
                      min={0}
                      max={0.5}
                      step={0.05}
                      value={tangentProb}
                      onChange={(e) => updateOverride(effectiveTab, { tangentProbability: parseFloat(e.target.value) })}
                    />
                    <div className="config-slider-ticks">
                      <span>focused</span>
                      <span>tangential</span>
                    </div>
                  </div>
                </div>

                {/* depth (attention) */}
                <div className="config-dial">
                  <div className="config-dial-header">
                    <p className="config-dial-label">depth</p>
                    <span className="config-dial-spec">{Math.round(attentionNorm * 100)}%</span>
                  </div>
                  <div className="config-slider-wrap">
                    <input
                      type="range"
                      className="config-slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={attentionNorm}
                      onChange={(e) => updateOverride(effectiveTab, { attentionWindow: Math.round(parseFloat(e.target.value) * 20) })}
                    />
                    <div className="config-slider-ticks">
                      <span>shallow</span>
                      <span>deep</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* topic tags */}
              <div style={{ marginTop: 16 }}>
                <p className="config-dial-label" style={{ marginBottom: 8 }}>topics</p>
                <div className="config-tags">
                  {ALL_TAGS.map((tag) => {
                    const isTagActive = activeTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        className={`config-tag${isTagActive ? " config-tag--active" : ""}`}
                        style={isTagActive ? { background: tuneChar.color, borderColor: tuneChar.color } : undefined}
                        onClick={() => {
                          const newTags = isTagActive
                            ? activeTags.filter((t) => t !== tag)
                            : [...activeTags, tag];
                          updateOverride(effectiveTab, { tags: newTags });
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Group Dynamics (collapsible) ──────────────────────── */}
        <section className="config-section">
          <button className="config-collapse-trigger" onClick={() => setGroupOpen((o) => !o)}>
            <span className="config-collapse-arrow" data-open={groupOpen}>&#9654;</span>
            <div className="config-section-header">
              <span className="config-section-num">03</span>
              <h2 className="config-section-title">group dynamics</h2>
            </div>
          </button>
          <hr className="config-section-rule" />

          <div className="config-collapse-body" data-open={groupOpen}>
            <div className="config-group-row">
              {/* conversation depth */}
              <div className="config-group-item">
                <div className="config-dial-header">
                  <p className="config-group-item-label">conversation depth</p>
                  <span className="config-group-item-spec">{groupSettings.depth}</span>
                </div>
                <div className="config-segmented">
                  {["quick", "normal", "deep"].map((d) => (
                    <button
                      key={d}
                      className={`config-seg-btn${groupSettings.depth === d ? " config-seg-btn--active" : ""}`}
                      onClick={() => setGroupSettings((s) => ({ ...s, depth: d }))}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* pulls you in */}
              <div className="config-group-item">
                <div className="config-dial-header">
                  <p className="config-group-item-label">pulls you in</p>
                  <span className="config-group-item-spec">{Math.round(groupSettings.engagement * 100)}%</span>
                </div>
                <div className="config-slider-wrap">
                  <input
                    type="range"
                    className="config-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={groupSettings.engagement}
                    onChange={(e) => setGroupSettings((s) => ({ ...s, engagement: parseFloat(e.target.value) }))}
                  />
                  <div className="config-slider-ticks">
                    <span>rarely</span>
                    <span>often</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="config-footer">
        <span className="config-footer-status">auto-saved &middot; changes apply to next chat</span>
        <div className="config-footer-actions">
          <button className="config-reset-btn" onClick={resetDefaults}>
            reset to defaults
          </button>
          <Link href="/chat" className="config-back-link">
            &larr; back to chat
          </Link>
        </div>
      </footer>
    </div>
  );
}
