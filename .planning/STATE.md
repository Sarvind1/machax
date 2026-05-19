# Project State

**Project:** MachaX
**Milestone:** chat-realism-context-fixes
**Last activity:** 2026-05-20 — Quick task 260519-x71 (Fix 3: character voice anchoring) code-complete and awaiting human verify. 29/29 tests pass (21 prior + 8 new voice-anchor cases); tsc clean. 13 core characters seeded with mesExample/antiPatterns/stances extracted mechanically from existing systemPrompts.

## Active Phase

Fix 3 — character voice anchoring (`buildVoiceAnchorBlock` helper + 13 core seeds + U-shape injection). Code landed; pending human-verify in dev chat.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Speaker-selection gate | ✓ Verified |
| 2 | Per-character private memory | ✓ Verified |

## Blockers/Concerns

None.

## Surfaced for Phase 2

- Scenario B verification revealed characters fabricating context ("linkedin", "dead end roles" on a Delhi-heat prompt). Confirms the per-character private memory + topic-grounding work is the right next move.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260519-gzz | Speaker-selection gate for chat engine | 2026-05-19 | 4589442 | Verified ✓ | [260519-gzz-speaker-selection-gate-for-chat-engine-r](./quick/260519-gzz-speaker-selection-gate-for-chat-engine-r/) |
| 260519-kq3 | Per-character private memory (Fix 2) | 2026-05-19 | d87dcf0 | Verified ✓ | [260519-kq3-fix-2-per-character-private-memory](./quick/260519-kq3-fix-2-per-character-private-memory/) |
| 260519-x71 | Character voice anchoring (Fix 3) | 2026-05-20 | 81ed539 | checkpoint:human-verify | [260519-x71-fix-3-character-voice-anchoring](./quick/260519-x71-fix-3-character-voice-anchoring/) |
