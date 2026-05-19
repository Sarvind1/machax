# Resume — Fix 2 (per-character private memory)

**Paused:** 2026-05-19 after Fix 1 (speaker-selection gate) verified in dev.

## Where you are

- Fix 1 ✓ shipped to dev, verified programmatically. Code at `4589442`, verify commit `c0f7227`.
- Fix 2 not started. ROADMAP.md Phase 2 has the success criteria.
- No uncommitted changes. Branch: `main`. Clean.

## To resume

Tell Claude: **"resume fix 2 from .planning/RESUME.md"**

That triggers Phase 2: per-character private memory. The cheapest entry point is the same path as Fix 1 — `/gsd-quick --validate` with the spec below.

## Fix 2 spec (paste this into /gsd-quick --validate when ready)

```
Per-character private memory for chat engine.

CONTEXT: Each bot currently sees the full conversation transcript as context.
That's why characters fabricate things they weren't told (verified in Fix 1
end-to-end: Reeva/Zara riffed on "linkedin" / "dead end roles" for a Delhi-heat
prompt). Real friends don't know what they didn't hear.

GOAL: Replace full-transcript context with a per-character filtered view.
Pattern from Generative Agents / Smallville:

1. FILTER — character X sees: (a) messages they sent, (b) messages where X was
   the replyTo target, (c) messages that mention X by name, (d) the user's
   messages (always visible — user addresses the group).
2. SUMMARIZE — older messages outside this filter compressed into a one-line
   per-character perspective summary placed at the TOP of the prompt
   (U-shape attention zone).
3. RETRIEVAL — for older content, score as recency × importance × relevance.
   Importance: LLM-rated 1-10 OR length-based heuristic v1.

DO NOT TOUCH: speaker-selection gate (Fix 1, working). Cosine diversity gate
(separate fix). Character voice / personas (separate polish).

ACCEPTANCE:
- Each character's prompt no longer contains the full raw transcript
- Filter rule: char sees own + replyTo + mention + user messages
- Older content summarized per character (not one global summary)
- Speaker-gate from Fix 1 still works; cap of 3 still holds
- Existing SSE / traces / media / replyTo flows still work

FILES likely involved (verify before editing): src/lib/orchestrator.ts (where
the per-character prompt is assembled), prompt-building helpers, character
profile definitions if a `voice_sample` field is being added. Use Grep — do
not guess paths.

VERIFY by re-running the same 4 dev-Convex test scenarios from Fix 1 (Delhi
heat, mention Reeva, "developed" word boundary, sad-dog emotional). Phase 1
behavior must not regress. Plus: spot-check that bot responses no longer
reference content from messages they shouldn't have seen.
```

## Heads-up before kicking off

- Phase 2 is bigger than Phase 1. The fanout in `src/lib/orchestrator.ts` builds the per-character prompt — that's the surface area. Plan-checker should verify the filter rule is correct and the summarization step doesn't blow context tokens.
- The verifier should add one new check beyond Fix 1's four: send two follow-up messages and confirm character N's response only references things they were present for (no fabrication of unseen content).
