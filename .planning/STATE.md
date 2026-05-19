# Project State

**Project:** MachaX
**Milestone:** chat-realism-context-fixes
**Last activity:** 2026-05-19 — Quick task 260519-kq3 verified in dev: 5/5 scenarios pass (4 Fix-1 regressions + new did-not-witness). Reeva's turn-B prompt confirmed to open with `[Your private memory of what you missed:` marker and exclude topic-A bot transcript.

## Active Phase

None — Fix 1 and Fix 2 both verified.

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
