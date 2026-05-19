---
quick_id: 260519-kq3
slug: fix-2-per-character-private-memory
description: Per-character private memory for chat engine (Generative Agents pattern)
status: complete
date: 2026-05-19
---

# Fix 2 — Per-character private memory

## What changed

Each character's per-turn prompt is now a filtered view of the conversation, not the full raw transcript. Filter rule:

- (a) messages the character sent themselves
- (b) messages where the character was the `replyTo` target
- (c) messages whose text mentions the character's name (word-boundary, case-insensitive — same pattern as Fix 1's speaker-selection gate)
- (d) all user messages

Everything outside this visible-set is compressed into a one-line per-character perspective summary prepended at the TOP of the prompt (U-shape attention zone), wrapped as `[Your private memory of what you missed: ...]`.

Fix 1's speaker-selection gate is untouched. Cap-of-3, SSE events, traces, replyTo arrows, and media flows are unchanged.

## Files modified

| File | Change |
|------|--------|
| `src/lib/private-memory.ts` | NEW — pure module: `filterVisibleForCharacter`, `summarizeHidden`, `buildCharacterMemory`, `ChatEntry`, `CharacterMemoryInput`, `CharacterMemoryResult` |
| `src/lib/private-memory.test.ts` | NEW — 15 unit tests covering filter rule, per-character summaries, word-boundary mention, empty/all-visible edge cases, optional cap |
| `src/lib/orchestrator.ts` | `ChatEntry` extended with optional `replyTo`; `callFriend` swaps `formatWindowedTranscript()` for `buildCharacterMemory()`; per-character summary prepended at prompt TOP; `roundResponses` entries carry `replyTo`; `formatWindowedTranscript` kept with TODO marker |

## Tests added

15 tests in `src/lib/private-memory.test.ts`:

- `filterVisibleForCharacter`: own / replyTo / mention / user inclusion; hides messages between other chars; per-character visible-set differs; empty history; word-boundary regression (`developed` does NOT match `dev`); order preserved.
- `summarizeHidden`: empty returns `""`; non-empty produces ≤140-char summary mentioning sender(s).
- `buildCharacterMemory`: visible + summary + visibleTranscript composition; empty summary when nothing is hidden; empty history; optional cap keeps LAST N visible.

## Verify status

| Task | Verify | Status |
|------|--------|--------|
| 1 — private-memory module + tests | `npm test -- private-memory` | ✓ 15/15 pass |
| 2 — orchestrator wiring | `npm test` + `npx tsc --noEmit` | ✓ 21/21 pass (15 private-memory + 6 speaker-selection); typecheck clean |
| 3 — dev-Convex human verify | manual scenarios | ⏳ Awaiting human |

## Commits

- `18a7778` — feat(260519-kq3): add private-memory module + unit tests
- `d87dcf0` — feat(260519-kq3): wire per-character memory into orchestrator

## Awaiting human verification

Run dev server with `bash dev.sh` (per project memory — never manual commands), open the dev chat URL, and run these scenarios:

### Fix 1 regression scenarios (must still pass)

- [ ] **"delhi heat is unbearable today"** → ≤3 speakers; none fabricating "linkedin" / "dead end roles".
- [ ] **"@reeva what do you think"** → Reeva MUST be in responders; cap ≤3 holds.
- [ ] **"the company developed a new product"** → "dev" must NOT match "developed" (word-boundary).
- [ ] **"my dog died this morning"** → emotional response, ≤3 speakers, no derailment.

### New Fix 2 did-not-witness check

- [ ] Send a 3-message conversation where two non-mentioned characters reply to each other about topic A. Then send a NEW user message that pulls in a different character C who was NOT mentioned and NOT a replyTo target during topic A. Confirm C's reply does NOT reference specific content from topic A.
  - Inspect `engine-log.jsonl` for C's prompt: it should open with `[Your private memory of what you missed: ...]` and the full topic-A content should NOT be inlined in the visible transcript.

### Spot-checks

- [ ] SSE stream renders character-by-character as before.
- [ ] Media (gifs/stickers) still resolve and display.
- [ ] `replyTo` arrows in the UI still render correctly.

### Verify run — 2026-05-19

Programmatic test agent drove all 5 scenarios via `POST /api/chat` against the dev server (Convex + Next.js).

| # | Scenario | Speakers | Result |
|---|---|---|---|
| 1 | Delhi heat | 2 (priya, simran) | ✓ no "linkedin"/"dead end" |
| 2 | @reeva mention | 3 (reeva, simran, divya) | ✓ reeva in pod, cap ≤3 |
| 3 | "developed" word | 2 (aarushi, simran) | ✓ no crash, sane response |
| 4 | dog died | 2 (aarushi, divya) | ✓ sympathetic, no derailment |
| 5 | did-not-witness | reeva responded | ✓ no "manali" in reply |

Scenario 5 evidence: reeva's turn-B prompt opened with `[Your private memory of what you missed: you missed 12 messages from aarushi, priya, simran about: ...]` and her visible transcript contained only her own messages + user messages. Topic-A bot content was provably excluded — confirmed by inspecting engine-log.jsonl and re-running `buildCharacterMemory` programmatically.

Raw artifacts: `/tmp/fix2-test-results.txt`.

**Status:** approved.

## Known stubs / future work

- `summarizeHidden` v1 uses **length-based importance** (longest hidden message → representative example). TODO marker in code for LLM-rated importance (1-10) per Generative Agents §4.2 — explicitly out of scope for Fix 2.
- `formatWindowedTranscript` retained with TODO marker in case other paths reference it. Deletion is a separate cleanup pass.
