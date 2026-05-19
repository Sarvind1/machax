---
phase: 260519-gzz-speaker-selection-gate
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/engine-types.ts
  - src/lib/friends.ts
  - src/lib/speaker-selection.ts
  - src/lib/speaker-selection.test.ts
  - src/lib/orchestrator.ts
  - package.json
autonomous: false
requirements:
  - CHAT-01
must_haves:
  truths:
    - "A single user turn produces messages from at most 3 distinct characters (cap enforced)."
    - "A user message that contains a character's name (case-insensitive, word-boundary) forces that character to respond."
    - "Non-mentioned characters respond based on a per-character talkativeness weight multiplied by tag/keyword topic-fit score."
    - "Every Friend in src/lib/friends.ts has an explicit talkativeness value in [0.0, 1.0] — no character is missing the field."
    - "SSE streaming, traces, replyTo, and media still flow end-to-end for the selected subset."
    - "A unit test with a seeded RNG asserts: mention forces inclusion, cap of 3 holds when 5+ chars qualify, talkativeness=0 silences a character."
  artifacts:
    - path: "src/lib/speaker-selection.ts"
      provides: "Pure selectSpeakers() function — extracted, RNG-injectable, no SSE/Convex deps."
      exports:
        - "selectSpeakers"
        - "MAX_RESPONDERS_PER_TURN"
        - "SpeakerSelectionInput"
        - "SpeakerSelectionResult"
    - path: "src/lib/speaker-selection.test.ts"
      provides: "Deterministic unit tests with seeded RNG."
      contains: "describe('selectSpeakers'"
    - path: "src/lib/engine-types.ts"
      provides: "talkativeness field added to AgentTraits."
      contains: "talkativeness"
    - path: "src/lib/friends.ts"
      provides: "talkativeness on every Friend's traits + DEFAULT_TALKATIVENESS const."
      contains: "talkativeness:"
    - path: "src/lib/orchestrator.ts"
      provides: "Gated fanout — calls selectSpeakers once per user turn, then loops only over chosen ids."
      contains: "selectSpeakers"
  key_links:
    - from: "src/lib/orchestrator.ts (orchestrateChat → main while loop)"
      to: "src/lib/speaker-selection.ts (selectSpeakers)"
      via: "single call before iteration loop; result narrows the agents[] universe"
      pattern: "selectSpeakers\\("
    - from: "src/lib/orchestrator.ts"
      to: "FRIENDS_BY_ID[id].traits.talkativeness"
      via: "passed into selectSpeakers per candidate"
      pattern: "talkativeness"
    - from: "src/app/api/chat/route.ts"
      to: "src/lib/orchestrator.ts (orchestrateChat)"
      via: "unchanged — same signature, just narrower fanout downstream"
      pattern: "orchestrateChat\\("
---

<objective>
Replace pod-wide fanout in the chat engine with a speaker-selection gate. For each user turn, decide upfront which 1–3 characters respond, instead of letting all 5–7 pod members iterate until energy depletes.

Purpose: Stop the pile-on wall, clarifying-question chorus, and off-topic responders verified in prod conversations `j976z9282c94bcvbzt05qvzfc18716my` and `j97c4148rh5mx9p407ys6knphs871p7d`.

Output: New `speaker-selection.ts` module + unit tests + `talkativeness` field on every Friend + orchestrator wired to gate fanout through the selector.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@CLAUDE.md
@AGENTS.md

@src/lib/engine-types.ts
@src/lib/friends.ts
@src/lib/orchestrator.ts
@src/app/api/chat/route.ts

<interfaces>
Existing contracts the executor MUST honor:

From src/lib/engine-types.ts:
```typescript
export interface AgentTraits {
  responseSpeed: "impulsive" | "normal" | "thoughtful";
  interruptProbability: number;
  agreementBias: number;
  verbosityRange: [number, number];
  confidenceLevel: number;
  lurkerChance: number;
  tangentProbability?: number;
  attentionWindow?: number;
  mediaSendProbability?: number;
  // NEW field added in this plan:
  // talkativeness: number; // 0.0–1.0, default 0.5
}
```

From src/lib/friends.ts:
```typescript
export interface Friend {
  id: string; name: string; role: string;
  tags: string[]; // already used as the topic-fit signal
  // ... color/tintBg/tintInk/emoji/systemPrompt/defaultLength/category
  traits: AgentTraits; // talkativeness lives here
}
export const FRIENDS: Friend[];
export const FRIENDS_BY_ID: Record<string, Friend>;
export function computeTopicAffinity(friendTags: string[], userMessage: string): number; // returns [0,1]
```

From src/lib/orchestrator.ts (relevant landmarks):
- `orchestrateChat({ message, podFriendIds, history, userName, ... })` — async generator yielding `EngineEvent`s.
- Lines ~1272: `const agents: AgentPresence[] = podFriendIds.map((id) => initPresence(id));` — THIS is the universe that needs narrowing.
- Lines ~1336–1368: per-iteration candidate scoring; mention regex already exists at line 1338. The mention check is currently per-iteration — it should be promoted to a turn-level gate AND retained as a safety net.
- `MAX_ITERATIONS = 10` outer loop runs up to 10 times per user turn; this is what produces the pile-on.
</interfaces>

<observed_prod_failures>
- `j976z9282c94bcvbzt05qvzfc18716my` ("it's like 40 degree now in Delhi"): 5 bots fired every turn; chorus of clarifying questions from Aarushi/Lalitha/Priya; Noor leaked assistant voice.
- `j97c4148rh5mx9p407ys6knphs871p7d` ("how should I go from Bangalore airport to city?"): 7 bots fired; Meera leaked raw `[Sarvind2] ... [Meera] ...` speaker tags.
The fix here addresses fanout count (root cause of pile-on). Voice leaks are out of scope (separate polish).
</observed_prod_failures>

<scope_guardrails>
DO NOT touch in this plan:
- Per-character private memory (Phase 2).
- Prompt format / context sent per call — same context, just fewer recipients.
- Character voice / persona / systemPrompt fields.
- Cosine similarity diversity gate (depends on Phase 2).
- Convex schema — no DB writes for selection logic.
</scope_guardrails>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract selectSpeakers() with vitest + add talkativeness field</name>
  <files>src/lib/engine-types.ts, src/lib/friends.ts, src/lib/speaker-selection.ts, src/lib/speaker-selection.test.ts, package.json</files>
  <behavior>
    Pure function `selectSpeakers(input: SpeakerSelectionInput): SpeakerSelectionResult` lives in `src/lib/speaker-selection.ts` with no React, no Convex, no SSE imports. Input shape: `{ podFriendIds: string[]; userMessage: string; friendsById: Record<string, Friend>; rng?: () => number; cap?: number; }`. Default `cap = 3`. Default `rng = Math.random`. Result shape: `{ chosen: string[]; reasons: Record<string, "mention" | "soft" | "skipped">; scores: Record<string, { mention: boolean; talkativeness: number; topicFit: number; pRespond: number; roll?: number; }>; }`.

    Algorithm:
    1. HARD trigger — for each podFriendId, build a name list: `[friend.name.toLowerCase()]`. Word-boundary case-insensitive substring on the user message: `new RegExp(\`\\b${escapeRegExp(name)}\\b\`, 'i').test(userMessage)`. Forced inclusion if matched. Include ALL mentioned characters even if it exceeds cap — the cap is a SOFT trigger budget; mentions are non-negotiable per acceptance criterion 2.
    2. SOFT trigger — for each non-mentioned podFriendId: `talkativeness = friend.traits.talkativeness ?? DEFAULT_TALKATIVENESS` (0.5). `topicFit = computeTopicAffinity(friend.tags, userMessage)` (reuse the existing function — import from `./friends`). `pRespond = talkativeness * topicFit`. Roll `rng()`; include if `roll < pRespond`.
    3. CAP — if `mentioned.length >= cap`, soft-triggered list is dropped to zero (mentions saturate the budget). Otherwise fill remaining slots with highest `pRespond` soft candidates (sort desc by pRespond, take `cap - mentioned.length`). FLOOR: if after all rules `chosen.length === 0`, pick the single highest-`pRespond` candidate so the chat never silently dies on a low-affinity message.
    4. Export `MAX_RESPONDERS_PER_TURN = 3` and `DEFAULT_TALKATIVENESS = 0.5` constants.

    AgentTraits change (src/lib/engine-types.ts): add `talkativeness: number;` REQUIRED (not optional) on `AgentTraits`. This forces every Friend to be explicit and surfaces missing values as a TypeScript error.

    Friends change (src/lib/friends.ts): add `talkativeness: <value>` to the `traits` object of EVERY Friend in the FRIENDS array. Defaults by character archetype (use systemPrompt tone + role + tags to assign):
      - Loud / always-on archetypes (Zara ALL-CAPS, Kritika red-flag bestie, Reeva impatient career, Priya nosy, Simran emoji-flood): 0.75–0.85
      - Average chatty (most defaults): 0.5
      - Quiet/reactive (Nalini fortune-cookie one-liner, Sonal, Jiya, characters whose prompt explicitly says "you don't say much" or "rarely speaks first"): 0.25–0.35
    Use your judgement per character; ensure the 13 core characters get sensible values. Document the rationale in a one-line comment next to each non-default value.

    Test framework: install vitest as a devDependency (`pnpm`/`npm` — repo uses npm; use `npm install -D vitest`) and add `"test": "vitest run"` to package.json scripts. Use vitest because it's zero-config for TS + ESM, lighter than jest, and Next.js 16 ESM-by-default plays nicely. (Verified: vitest is the standard for Next 14+ TS projects; jest needs a babel pipeline this repo doesn't have.)

    speaker-selection.test.ts MUST contain:
      - Seeded RNG helper (e.g., mulberry32 — inline ~6 lines, no extra dep).
      - Test: "name mention forces inclusion even at talkativeness=0" — set Reeva.talkativeness=0, message "what do you think reeva?", assert "reeva" ∈ chosen.
      - Test: "cap of 3 holds with 5 high-affinity qualifying candidates" — 5 friends all with talkativeness=1.0 and matching tags, seeded RNG, assert chosen.length === 3.
      - Test: "talkativeness=0 with no mention → not chosen unless floor kicks in" — single non-matching friend with t=0; with another t=0.5 friend with matching tag, assert the t=0 is skipped.
      - Test: "mentioned characters bypass cap" — 4 mentions in a row, assert all 4 returned with reasons all "mention" (cap is a SOFT budget; document this in the function header).
      - Test: "floor: zero candidates above threshold returns the single best" — message with no keyword matches, all talkativeness=0.1, assert chosen.length === 1.
      - Test: "word-boundary mention does not match substring" — friend name "dev", message "developed a fever", assert NOT chosen via mention path.

    DO NOT touch orchestrator.ts in this task — wiring is Task 2. This task is the contract + tests in isolation, so the gate can be reasoned about and changed independently of the engine.
  </behavior>
  <action>Create src/lib/speaker-selection.ts implementing selectSpeakers per the behavior spec above. Add `talkativeness: number` (required) to AgentTraits in engine-types.ts. Add `talkativeness` to traits on every Friend in friends.ts with archetype-appropriate values and a brief rationale comment for non-default values. Install vitest (`npm install -D vitest`) and add the `test` script to package.json. Write src/lib/speaker-selection.test.ts covering all six test cases above with seeded RNG (mulberry32 inline). Run `npx tsc --noEmit` to verify the AgentTraits change forced every Friend to declare talkativeness (no missing-field errors). Per AGENTS.md, this is the unfamiliar Next.js fork — but this task touches no Next.js route code, only `src/lib/` pure modules and a test, so no docs read needed for this task.</action>
  <verify>
    <automated>npm test -- src/lib/speaker-selection.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>vitest run passes all six speaker-selection tests; `npx tsc --noEmit` is clean (proves every Friend has talkativeness); src/lib/speaker-selection.ts exports the four symbols listed in must_haves.artifacts; package.json has vitest devDep and a test script.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire selectSpeakers into orchestrator and narrow the agents universe</name>
  <files>src/lib/orchestrator.ts</files>
  <behavior>
    Before the `while (energy > ENERGY_FLOOR ...)` loop in `orchestrateChat` (around line 1283), call `selectSpeakers` exactly once per user turn using the LATEST user message in `history`+`message`. Use the returned `chosen` array to narrow the agents universe at line ~1272:

    Replace:
    ```
    const agents: AgentPresence[] = podFriendIds.map((id) => initPresence(id));
    ```
    With:
    ```
    const selection = selectSpeakers({
      podFriendIds,
      userMessage: message,
      friendsById: FRIENDS_BY_ID,
    });
    const speakerIds = selection.chosen;
    const agents: AgentPresence[] = speakerIds.map((id) => initPresence(id));
    ```

    Emit a `trace` event so the existing trace pipeline captures the selection (extend `IterationTrace` is NOT necessary — surface the selection as a one-shot trace via the existing `ConversationTrace.iterations` array by adding a `selectionMeta` field on the trace OR by logging `console.log("[engine] speaker-selection", selection.reasons)`). PREFER the console.log path — it's the smallest diff and unblocks debugging without schema changes to traces. Mention `selection.reasons` and `selection.scores` so trace inspection in dev mode shows why each character was picked.

    Retain the existing per-iteration mention check at line 1338 as a SAFETY NET (so a mention in a follow-up assistant turn or a `replyTo` chain still routes correctly). The per-turn gate just narrows the universe; the per-iteration logic continues to operate on that narrower set. Do NOT remove the inner `shouldRespond`, `computeTopicAffinity`, `scoreMessagesForAgent` calls — they shape per-iteration ordering and remain useful.

    Do NOT change MAX_ITERATIONS. Do NOT change energy logic. Do NOT change SSE event shapes. Do NOT touch `callFriend`. Do NOT touch the decision-extraction path at the bottom of orchestrateChat.

    Edge case: if `podFriendIds.length <= 1`, skip selectSpeakers (single-bot pod, no gating needed) — but still apply the mention check via the existing per-iteration logic. Document this in a code comment.

    Per AGENTS.md, this is a Next.js fork — but orchestrator.ts is a plain TS lib file, no Next.js-specific APIs touched. Safe to edit directly. The chat route (src/app/api/chat/route.ts) is unchanged.
  </behavior>
  <action>Edit src/lib/orchestrator.ts: import `selectSpeakers` from `./speaker-selection` at the top, then insert the selection call and narrow `podFriendIds` to `speakerIds` for the `agents[]` initialization. Add the `console.log("[engine] speaker-selection", ...)` line for trace visibility. Add a brief code comment explaining "per-turn gate; per-iteration mention check below remains as safety net." Run `npx tsc --noEmit` and `npm test` to verify no regressions in the selection unit tests and no type errors.</action>
  <verify>
    <automated>npx tsc --noEmit && npm test</automated>
  </verify>
  <done>orchestrator.ts compiles clean; speaker-selection unit tests still pass; orchestrateChat narrows the agents universe via selectSpeakers; one-line console.log surfaces selection reasons; no diff to src/app/api/chat/route.ts.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual end-to-end verify on dev Convex deployment</name>
  <what-built>
    Speaker-selection gate live in dev: at most 3 bots respond per user turn (cap), mentions force inclusion, talkativeness/topic-fit shapes the rest. SSE/traces/media/replyTo paths are unchanged.
  </what-built>
  <how-to-verify>
    1. Start the dev server: `./dev.sh` (per project convention — do NOT run `next dev` manually).
    2. Log in to the dev environment (dev Convex deployment `fiery-ocelot-22`) and open a chat with a pod of 5+ characters that includes Reeva and Zara.
    3. **Cap test:** Send "it's like 40 degree now in Delhi" (the prod failure case). Count distinct character avatars/names in the response stream. Expected: 1–3 distinct responders, NOT 5+.
    4. **Mention test:** Send "what do you think reeva?". Expected: Reeva is among the responders (forced).
    5. **Mention test, word boundary:** Send "i developed a new habit". Expected: a character named "Dev" (if any) is NOT forced — verify by checking who responded.
    6. **Media + replyTo still flow:** Send something emotional like "feeling flat for no reason". Expected: at least one response, possibly with a GIF/sticker; if a bot replies to another bot, the `replyTo` chain renders correctly in the UI.
    7. **Trace check:** Open `/admin/traces`, find the latest trace, confirm `iterations` shows responses from only the selected subset (not the whole pod). Look at the server logs for `[engine] speaker-selection` lines and confirm `reasons` ∈ {mention, soft, skipped} per character.
    8. **Regression check:** SSE stream completes with `done:true`. No 500s in the chat route. Existing `/decisions` page extraction still works after a multi-turn conversation.

    If any of 3, 4, 6, 8 fail, do NOT mark approved — report which step failed and the observed responder count / error.
  </how-to-verify>
  <resume-signal>Type "approved" once all 8 checks pass, or describe the failing check with the conversation ID for log inspection.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/chat | User-controlled `message` string crosses into the selection function. |
| selectSpeakers → RegExp | User message becomes a regex test target. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gzz-01 | Tampering (Injection) | `selectSpeakers` regex construction | mitigate | The regex is built from the friend NAME (server-side constant), not user input — escape the name via an inline `escapeRegExp` helper anyway as defense-in-depth. The user message is only the `.test()` target, never the pattern source. |
| T-gzz-02 | Denial of Service | `selectSpeakers` over a huge user message | accept | Existing /api/chat already accepts arbitrary message length without gating; selection is O(podSize) regex tests, bounded by 13 characters × one regex per name. No new amplification. |
| T-gzz-03 | Information Disclosure | `console.log("[engine] speaker-selection", reasons)` | accept | Logs already contain user prompts (line 1252, 1297). Adding selection reasons does not change the log sensitivity tier. Production log destination is operator-controlled. |
</threat_model>

<verification>
- `npm test` — all selectSpeakers tests pass with seeded RNG.
- `npx tsc --noEmit` — no type errors; AgentTraits.talkativeness required-field change forces every Friend to declare it.
- Manual dev-Convex end-to-end (Task 3): cap holds, mentions force, replyTo/media still flow.
- Check `/admin/traces` after the dev test: iteration logs show responses from only the selected subset.
</verification>

<success_criteria>
1. ✓ Single user message fires 1–3 bots (Task 3 step 3).
2. ✓ Mentioning a character by name forces them in (Task 3 step 4 + unit test).
3. ✓ Every Friend has explicit talkativeness; 13 core characters get archetype-appropriate values (Task 1 + tsc clean).
4. ✓ SSE, traces, media, replyTo flows unchanged (Task 3 steps 6–8).
5. ✓ Selection logic is unit-tested in isolation with seeded RNG (Task 1).
</success_criteria>

<output>
After completion, create `.planning/quick/260519-gzz-speaker-selection-gate-for-chat-engine-r/260519-gzz-01-SUMMARY.md` recording:
- The talkativeness values assigned per character and the rationale.
- The cap decision (3) and floor behavior.
- Any deviation from the spec (e.g., if trace event shape was changed instead of console.log).
- Confirmation of the four acceptance criteria from ROADMAP Phase 1.
</output>
