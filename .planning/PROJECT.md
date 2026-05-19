# MachaX

AI group chat. 13 distinct characters talk with the user and with each other. Built on Gemini + Convex + Next.js. Goal: feel like a real group of friends, not an assistant.

## Core value

A group chat where each character is distinct, opinionated, and reacts to context — not a chorus of identical helpful bots.

## Current focus (this initialization)

Bootstrapping GSD scaffolding mid-project to track two scoped chat-realism fixes derived from prod chat analysis + research on multi-agent role-play systems.

Research synthesized two structural fixes that carry most of the weight for context-management problems:

1. **Speaker-selection gate** — stop firing every bot every turn. Mention-detection + talkativeness × topic-fit + cap of 3 responders. Pattern from SillyTavern / Character.AI PipSqueak.
2. **Per-character private memory** — each character only knows what they were present for or told. Retrieval scored as `recency × importance × relevance`. Pattern from Generative Agents / Smallville.

Both fixes touch the chat engine. Doing speaker-gate first, then private memory.

## Requirements

### Validated (existing)

- ✓ 13 core character cards with voice/persona definitions
- ✓ Gemini-backed chat fanout per pod
- ✓ Convex persistence (conversations, messages, traces)
- ✓ Demo mode + auth + Android Capacitor build
- ✓ Media tier cascade (Klipy → self-hosted → Imgflip)

### Active

- [ ] **CHAT-01**: Speaker-selection gate — 1–3 bots respond per turn, not the whole pod
- [ ] **CHAT-02**: Per-character private memory — each bot only sees context they participated in

### Out of Scope (for this scaffolding pass)

- Voice samples per character — separate polish pass
- Cosine-similarity diversity gate — depends on per-char memory landing first
- Pre-seeded opinion stances — separate pass
- Emotional state variables — separate pass

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Sequential fix order (gate → memory) | Both fixes touch the same engine; parallel = merge conflicts. Gate is smaller, faster signal. | Pending |
| Heuristic topic-fit first, embeddings later | Cheap first pass beats over-engineering | Pending |
| Cap responders at 3 | SillyTavern/Character.AI ship similar caps | Pending |

---
*Last updated: 2026-05-19 — mid-project GSD bootstrap*
