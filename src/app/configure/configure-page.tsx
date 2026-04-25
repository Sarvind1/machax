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

// ── Profile data (hardcoded — parsing systemPrompts is fragile) ──────
const PROFILE_DATA: Record<string, { age: string; gender: string; city: string; occupation: string }> = {
  priya:   { age: "26", gender: "F", city: "Mumbai",    occupation: "Content writer" },
  divya:   { age: "27", gender: "F", city: "Bangalore", occupation: "UX researcher" },
  meera:   { age: "24", gender: "F", city: "Delhi",     occupation: "Marketing" },
  arjun:   { age: "28", gender: "M", city: "Bangalore", occupation: "Product manager" },
  tanmay:  { age: "25", gender: "M", city: "Pune",      occupation: "Data analyst" },
  noor:    { age: "27", gender: "F", city: "Hyderabad", occupation: "Finance analyst" },
  pradeep: { age: "29", gender: "M", city: "Bangalore", occupation: "Operations manager" },
  suresh:  { age: "32", gender: "M", city: "Chennai",   occupation: "Ex-founder, corporate" },
  lalitha: { age: "26", gender: "F", city: "Bangalore", occupation: "Project manager" },
  farhan:  { age: "26", gender: "M", city: "Mumbai",    occupation: "Freelance journalist" },
  sneha:   { age: "28", gender: "F", city: "Delhi",     occupation: "Therapist" },
  dev:     { age: "25", gender: "M", city: "Bangalore", occupation: "Backend developer" },
  shekhar: { age: "29", gender: "M", city: "Mumbai",    occupation: "Lawyer" },
};

// ── All available tags across all friends ─────────────────────────────
const ALL_TAGS = Array.from(new Set(FRIENDS.flatMap((f) => f.tags))).sort();

// ── Modes ─────────────────────────────────────────────────────────────
const MODES = [
  { id: "late-night",       label: "late-night",       desc: "3am energy, unfiltered thoughts" },
  { id: "hot-takes",        label: "hot takes",        desc: "spicy opinions, no holding back" },
  { id: "deep-dive",        label: "deep dive",        desc: "long-form, thorough exploration" },
  { id: "devils-advocate",  label: "devil's advocate",  desc: "argue the other side, always" },
  { id: "emotional-support",label: "emotional support", desc: "gentle, caring, validating" },
  { id: "lovingly-roast",   label: "lovingly roast",   desc: "affectionate burns among friends" },
  { id: "hype-mode",        label: "hype mode",        desc: "maximum encouragement energy" },
  { id: "dark-humor",       label: "dark humor",       desc: "gallows humor, nothing sacred" },
  { id: "oversharing",      label: "oversharing",      desc: "tmi but in a bonding way" },
  { id: "debate-club",      label: "debate club",      desc: "structured arguments, pick sides" },
  { id: "silent-breaker",   label: "silent breaker",   desc: "draws out the quiet ones" },
  { id: "corporate-speak",  label: "corporate-speak",  desc: "let's circle back on that" },
];

const DEFAULT_MODES = ["hot-takes", "emotional-support", "lovingly-roast"];

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
  diversity: string;
  depth: string;
  engagement: number;
}

interface VibeSettings {
  pacing: string;
  creativity: number;
  mood: string;
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

function isActive(overrides: Record<string, CharacterOverride>, id: string): boolean {
  const ov = overrides[id];
  return ov?.active !== false;
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

// ── Component ─────────────────────────────────────────────────────────
export default function ConfigurePage({ userName }: { userName: string }) {
  const savedSettings = useQuery(api.settings.get, { username: userName });
  const saveSettings = useMutation(api.settings.save);

  const [selectedId, setSelectedId] = useState("priya");
  const [characterOverrides, setCharacterOverrides] = useState<Record<string, CharacterOverride>>({});
  const [groupSettings, setGroupSettings] = useState<GroupSettings>({
    podSize: 7, diversity: "balanced", depth: "normal", engagement: 0.4,
  });
  const [enabledModes, setEnabledModes] = useState<string[]>(DEFAULT_MODES);
  const [vibe, setVibe] = useState<VibeSettings>({ pacing: "natural", creativity: 0.6, mood: "settled" });

  const loaded = useRef(false);
  const initializing = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from Convex once
  useEffect(() => {
    if (!savedSettings || loaded.current) return;
    loaded.current = true;
    initializing.current = true;

    if (savedSettings.characterOverrides) {
      try {
        setCharacterOverrides(JSON.parse(savedSettings.characterOverrides));
      } catch { /* keep defaults */ }
    }
    if (savedSettings.podSize) setGroupSettings((s) => ({ ...s, podSize: savedSettings.podSize ?? s.podSize }));
    if (savedSettings.diversity) setGroupSettings((s) => ({ ...s, diversity: savedSettings.diversity ?? s.diversity }));
    if (savedSettings.conversationDepth) setGroupSettings((s) => ({ ...s, depth: savedSettings.conversationDepth ?? s.depth }));
    if (savedSettings.userEngagementFrequency != null) setGroupSettings((s) => ({ ...s, engagement: savedSettings.userEngagementFrequency ?? s.engagement }));
    if (savedSettings.enabledModes) setEnabledModes(savedSettings.enabledModes);
    if (savedSettings.pacing) setVibe((v) => ({ ...v, pacing: savedSettings.pacing ?? v.pacing }));
    if (savedSettings.creativity != null) setVibe((v) => ({ ...v, creativity: savedSettings.creativity ?? v.creativity }));
    if (savedSettings.mood) setVibe((v) => ({ ...v, mood: savedSettings.mood ?? v.mood }));

    // Allow save effect to run only after state settles from load
    setTimeout(() => { initializing.current = false; }, 0);
  }, [savedSettings]);

  // Auto-save (debounced)
  const doSave = useCallback(() => {
    saveSettings({
      username: userName,
      characterOverrides: JSON.stringify(characterOverrides),
      podSize: groupSettings.podSize,
      diversity: groupSettings.diversity,
      conversationDepth: groupSettings.depth,
      userEngagementFrequency: groupSettings.engagement,
      enabledModes,
      pacing: vibe.pacing,
      creativity: vibe.creativity,
      mood: vibe.mood,
    });
  }, [saveSettings, userName, characterOverrides, groupSettings, enabledModes, vibe]);

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

  const resetDefaults = () => {
    setCharacterOverrides({});
    setGroupSettings({ podSize: 7, diversity: "balanced", depth: "normal", engagement: 0.4 });
    setEnabledModes(DEFAULT_MODES);
    setVibe({ pacing: "natural", creativity: 0.6, mood: "settled" });
  };

  // ── Selected character ────────────────────────────────────────────
  const selected = FRIENDS_BY_ID[selectedId];
  if (!selected) return null;
  const profile = PROFILE_DATA[selectedId];
  const overrides = characterOverrides;

  // Current trait values for selected character
  const agreementBias = (getTraitValue(selected, overrides, "agreementBias") ?? 0) as number;
  const responseSpeed = (getTraitValue(selected, overrides, "responseSpeed") ?? "normal") as AgentTraits["responseSpeed"];
  const lurkerChance = (getTraitValue(selected, overrides, "lurkerChance") ?? 0.1) as number;
  const chattiness = 1 - lurkerChance;
  const verbosityRange = (getTraitValue(selected, overrides, "verbosityRange") ?? [5, 30]) as [number, number];
  const tangentProb = (getTraitValue(selected, overrides, "tangentProbability") ?? selected.traits.tangentProbability ?? 0) as number;
  const attentionNorm = getAttentionNormalized(selected, overrides);
  const activeTags = getOverride(overrides, selectedId).tags ?? selected.tags;
  const inPod = isActive(overrides, selectedId);

  return (
    <div className="config-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="config-header">
        <p className="config-wordmark">macha<em>x</em> &middot; the dials</p>
        <p className="config-subtitle">tune the people in your pod.</p>
        <p className="config-desc">
          each friend is a small NPC — a profile, a backstory, a voice, and a handful of behavior dials.
        </p>
      </header>

      {/* ── Layout ─────────────────────────────────────────────── */}
      <div className="config-layout">
        {/* ── Sidebar ────────────────────────────────────────── */}
        <aside className="config-sidebar">
          <p className="config-sidebar-label">your pod</p>
          <ul className="config-roster">
            {coreCharacters.map((f) => {
              const active = isActive(overrides, f.id);
              return (
                <li key={f.id}>
                  <button
                    className={`config-roster-item${selectedId === f.id ? " config-roster-item--active" : ""}`}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span className="config-roster-avatar" style={{ background: f.color }}>
                      {f.name[0]}
                      <span className={`config-roster-dot${active ? "" : " config-roster-dot--inactive"}`} />
                    </span>
                    <span className="config-roster-info">
                      <span className="config-roster-name">{f.name}</span>
                      <span className="config-roster-role">{f.role}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Content ────────────────────────────────────────── */}
        <main className="config-content">
          {/* ── 01 Profile ─────────────────────────────────── */}
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">01</span>
              <h2 className="config-section-title">profile</h2>
            </div>
            <hr className="config-section-rule" />

            <div className="config-profile">
              <span className="config-profile-avatar" style={{ background: selected.color }}>
                {selected.name[0]}
              </span>
              <div className="config-profile-info">
                <h3 className="config-profile-name" style={{ color: selected.tintInk }}>{selected.name}</h3>
                <p className="config-profile-role">{selected.role}</p>
                <p className="config-profile-vibe">{selected.emoji} {selected.category} &middot; default length: {selected.defaultLength}</p>

                {profile && (
                  <div className="config-facts">
                    <div className="config-fact">
                      <p className="config-fact-label">age</p>
                      <p className="config-fact-value">{profile.age}</p>
                    </div>
                    <div className="config-fact">
                      <p className="config-fact-label">gender</p>
                      <p className="config-fact-value">{profile.gender}</p>
                    </div>
                    <div className="config-fact">
                      <p className="config-fact-label">city</p>
                      <p className="config-fact-value">{profile.city}</p>
                    </div>
                    <div className="config-fact">
                      <p className="config-fact-label">occupation</p>
                      <p className="config-fact-value">{profile.occupation}</p>
                    </div>
                  </div>
                )}

                <div className="config-pod-toggle">
                  <span className={`config-pod-label ${inPod ? "config-pod-label--active" : "config-pod-label--inactive"}`}>
                    {inPod ? "in your pod" : "sitting out"}
                  </span>
                  <label className="config-toggle">
                    <input
                      type="checkbox"
                      checked={inPod}
                      onChange={(e) => updateOverride(selectedId, { active: e.target.checked })}
                    />
                    <span className="config-toggle-track" />
                    <span className="config-toggle-thumb" />
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* ── 02 Behavior Dials ──────────────────────────── */}
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">02</span>
              <h2 className="config-section-title">behavior dials</h2>
            </div>
            <hr className="config-section-rule" />

            <div className="config-grid">
              {/* personality (bipolar) */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">personality</p>
                  <span className="config-card-spec">{agreementBias > 0 ? "+" : ""}{agreementBias.toFixed(2)}</span>
                </div>
                <p className="config-card-help">how much they agree or push back</p>
                <div className="config-bipolar">
                  <span className="config-bipolar-center" />
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={agreementBias}
                    onChange={(e) => updateOverride(selectedId, { agreementBias: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="config-bipolar-labels">
                  <span>contrarian</span>
                  <span>neutral</span>
                  <span>agreeable</span>
                </div>
              </div>

              {/* reply speed (segmented) */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">reply speed</p>
                  <span className="config-card-spec">{responseSpeed}</span>
                </div>
                <p className="config-card-help">how fast they jump in</p>
                <div className="config-segmented">
                  {(["impulsive", "normal", "thoughtful"] as const).map((s) => (
                    <button
                      key={s}
                      className={`config-seg-btn${responseSpeed === s ? " config-seg-btn--active" : ""}`}
                      onClick={() => updateOverride(selectedId, { responseSpeed: s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* chattiness */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">chattiness</p>
                  <span className="config-card-spec">{Math.round(chattiness * 100)}%</span>
                </div>
                <p className="config-card-help">how often they speak vs lurk</p>
                <div className="config-slider-wrap">
                  <input
                    type="range"
                    className="config-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={chattiness}
                    onChange={(e) => updateOverride(selectedId, { lurkerChance: 1 - parseFloat(e.target.value) })}
                  />
                  <div className="config-slider-ticks">
                    <span>quiet</span>
                    <span>talkative</span>
                  </div>
                </div>
              </div>

              {/* message length (range) */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">message length</p>
                  <span className="config-card-spec">{verbosityRange[0]}-{verbosityRange[1]}w</span>
                </div>
                <p className="config-card-help">word count range per message</p>
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
                        updateOverride(selectedId, { verbosityRange: [v, verbosityRange[1]] });
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
                        updateOverride(selectedId, { verbosityRange: [verbosityRange[0], v] });
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
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">tangents</p>
                  <span className="config-card-spec">{Math.round(tangentProb * 100)}%</span>
                </div>
                <p className="config-card-help">chance of going off-topic</p>
                <div className="config-slider-wrap">
                  <input
                    type="range"
                    className="config-slider"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={tangentProb}
                    onChange={(e) => updateOverride(selectedId, { tangentProbability: parseFloat(e.target.value) })}
                  />
                  <div className="config-slider-ticks">
                    <span>focused</span>
                    <span>tangential</span>
                  </div>
                </div>
              </div>

              {/* depth (attention) */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">depth</p>
                  <span className="config-card-spec">{Math.round(attentionNorm * 100)}%</span>
                </div>
                <p className="config-card-help">how many messages they read back</p>
                <div className="config-slider-wrap">
                  <input
                    type="range"
                    className="config-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={attentionNorm}
                    onChange={(e) => updateOverride(selectedId, { attentionWindow: Math.round(parseFloat(e.target.value) * 20) })}
                  />
                  <div className="config-slider-ticks">
                    <span>shallow</span>
                    <span>deep</span>
                  </div>
                </div>
              </div>
            </div>

            {/* topic tags */}
            <div>
              <p className="config-card-label" style={{ marginBottom: 8 }}>topic tags</p>
              <div className="config-tags">
                {ALL_TAGS.map((tag) => {
                  const isTagActive = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`config-tag${isTagActive ? " config-tag--active" : ""}`}
                      style={isTagActive ? { background: selected.color, borderColor: selected.color } : undefined}
                      onClick={() => {
                        const newTags = isTagActive
                          ? activeTags.filter((t) => t !== tag)
                          : [...activeTags, tag];
                        updateOverride(selectedId, { tags: newTags });
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── 04 Group Settings ──────────────────────────── */}
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">04</span>
              <h2 className="config-section-title">group settings</h2>
            </div>
            <hr className="config-section-rule" />

            <div className="config-grid config-grid--4">
              {/* group size */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">group size</p>
                  <span className="config-card-spec">{groupSettings.podSize}</span>
                </div>
                <div className="config-segmented">
                  {[3, 5, 7, 9].map((n) => (
                    <button
                      key={n}
                      className={`config-seg-btn${groupSettings.podSize === n ? " config-seg-btn--active" : ""}`}
                      onClick={() => setGroupSettings((s) => ({ ...s, podSize: n }))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* diversity */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">diversity</p>
                  <span className="config-card-spec">{groupSettings.diversity}</span>
                </div>
                <div className="config-segmented">
                  {["similar", "balanced", "wild"].map((d) => (
                    <button
                      key={d}
                      className={`config-seg-btn${groupSettings.diversity === d ? " config-seg-btn--active" : ""}`}
                      onClick={() => setGroupSettings((s) => ({ ...s, diversity: d }))}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* conversation depth */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">conv. depth</p>
                  <span className="config-card-spec">{groupSettings.depth}</span>
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
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">pulls you in</p>
                  <span className="config-card-spec">{Math.round(groupSettings.engagement * 100)}%</span>
                </div>
                <p className="config-card-help">how often they ask you follow-ups</p>
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
                </div>
              </div>
            </div>
          </section>

          {/* ── 05 Modes ───────────────────────────────────── */}
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">05</span>
              <h2 className="config-section-title">modes</h2>
            </div>
            <hr className="config-section-rule" />

            <div className="config-grid config-grid--3">
              {MODES.map((mode) => {
                const on = enabledModes.includes(mode.id);
                return (
                  <button
                    key={mode.id}
                    className={`config-mode-card${on ? " config-mode-card--active" : ""}`}
                    onClick={() => {
                      setEnabledModes((prev) =>
                        on ? prev.filter((m) => m !== mode.id) : [...prev, mode.id]
                      );
                    }}
                  >
                    <label className="config-toggle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setEnabledModes((prev) =>
                            on ? prev.filter((m) => m !== mode.id) : [...prev, mode.id]
                          );
                        }}
                      />
                      <span className="config-toggle-track" />
                      <span className="config-toggle-thumb" />
                    </label>
                    <div className="config-mode-info">
                      <p className="config-mode-label">{mode.label}</p>
                      <p className="config-mode-desc">{mode.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 06 Vibe ────────────────────────────────────── */}
          <section className="config-section">
            <div className="config-section-header">
              <span className="config-section-num">06</span>
              <h2 className="config-section-title">vibe</h2>
            </div>
            <hr className="config-section-rule" />

            <div className="config-grid config-grid--3">
              {/* pacing */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">pacing</p>
                  <span className="config-card-spec">{vibe.pacing}</span>
                </div>
                <p className="config-card-help">overall conversation speed</p>
                <div className="config-segmented">
                  {["snappy", "natural", "slow"].map((p) => (
                    <button
                      key={p}
                      className={`config-seg-btn${vibe.pacing === p ? " config-seg-btn--active" : ""}`}
                      onClick={() => setVibe((v) => ({ ...v, pacing: p }))}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* creativity */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">creativity</p>
                  <span className="config-card-spec">{vibe.creativity.toFixed(1)}</span>
                </div>
                <p className="config-card-help">maps to temperature — wilder responses</p>
                <div className="config-slider-wrap">
                  <input
                    type="range"
                    className="config-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={vibe.creativity}
                    onChange={(e) => setVibe((v) => ({ ...v, creativity: parseFloat(e.target.value) }))}
                  />
                  <div className="config-slider-ticks">
                    <span>predictable</span>
                    <span>wild</span>
                  </div>
                </div>
              </div>

              {/* mood */}
              <div className="config-card">
                <div className="config-card-header">
                  <p className="config-card-label">mood today</p>
                  <span className="config-card-spec">{vibe.mood}</span>
                </div>
                <p className="config-card-help">overall energy of the group</p>
                <div className="config-segmented">
                  {["low", "settled", "up"].map((m) => (
                    <button
                      key={m}
                      className={`config-seg-btn${vibe.mood === m ? " config-seg-btn--active" : ""}`}
                      onClick={() => setVibe((v) => ({ ...v, mood: m }))}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="config-footer">
        <span className="config-footer-status">auto-saved &middot; changes apply to your next chat</span>
        <div className="config-footer-actions">
          <button className="config-reset-btn" onClick={resetDefaults}>
            reset to defaults
          </button>
          <Link href="/chat" className="config-back-link">
            back to chat
          </Link>
        </div>
      </footer>
    </div>
  );
}
