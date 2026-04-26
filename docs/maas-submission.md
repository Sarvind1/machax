# MachaX — MaaS Track Submission

## Live surface URL

https://machax.xyz

## Real output proofs

Screenshots of the agent system producing real output:

1. **Chat conversation** — AI focus group debating a user's question
   - File: `docs/screenshots/chat-conversation.png`
   
2. **Traces list** — All conversation traces persisted
   - File: `docs/screenshots/traces-list.png`

3. **Trace detail** — Iteration timeline showing agent selection, scores, energy decay
   - File: `docs/screenshots/traces-detail.png`

4. **Eval results** — Scored eval run with per-prompt breakdowns
   - File: `docs/screenshots/evals-page.png`
   - File: `docs/screenshots/evals-results.png`
   - File: `docs/screenshots/evals-running.png`

## Architecture description

MachaX runs an AI focus group — 5-7 persona agents debate a user's question and synthesize a decision.

**Agents:**
- **Director Agent** (1): Calls Gemini with Google Search grounding to research the topic. filterTopicForCharacter() gives different facts to different characters based on tag affinity — information asymmetry.
- **Character Agents** (5-7 per session, from pool of 100): Each has unique system prompt with demographics, personality, few-shot examples, verbal tics, contradictions.
- **Synthesis Agent** (1): Reads full transcript, extracts 3-4 decision options with supporting voices.

**Routing:** Score-based per iteration. Each cycle: score all active characters against all messages (relevance, recency, reply count, contrarian bias), run behavioral dropout, pick 1-2 fastest, call model in parallel, deduplicate, decay energy.

## Observability

**Tool:** Custom-built trace viewer at /admin/traces (Convex + React)

Each conversation generates a full trace persisted to Convex with:
- Per-iteration data: energy level, candidate count, selected agents with scores, skipped agents, energy decay
- Per-agent data: what they replied to, their score, response text, response time, failure status
- Summary: total time, iterations, messages, final energy, provider

**Trace viewer screenshot:** `docs/screenshots/traces-detail.png`

## Evaluation and iteration

**Eval set:** 15 curated prompts across 10 categories (career, casual, relationships, finance, life, startup, minimal, shopping, emotional, tech, controversial). Difficulty: 5 easy, 8 standard, 2 hard.

**Scoring:** Each prompt runs through the full orchestrator, then scored by Gemini 2.5 Flash on 8 criteria (naturalness, relevance, engagement, variety, pacing, length, completeness, entertainment), each 1-10.

**Run-to-run comparison:** Select two eval runs, see per-criterion avg deltas and per-prompt regression/improvement.

**Eval URL:** https://machax.xyz/admin/evals

**Eval proofs:** `docs/screenshots/evals-page.png`

## Agent handoffs and memory

**Short-term context:** Windowed transcript per character — impulsive agents see last 5 messages, thoughtful agents see full conversation. User messages always preserved.

**Director -> Character handoff:** filterTopicForCharacter() gives different research facts to different characters based on tag affinity (information asymmetry).

**Character -> Synthesis handoff:** After energy drops below threshold, synthesis agent reads full transcript and produces structured JSON decision options.

**No persistent cross-session memory** — each conversation starts fresh.

## Cost and latency

- Typical conversation: 15-30 seconds, ~$0.01-0.05 (Gemini 2.5 Flash)
- Full eval run (15 prompts): 3-5 minutes, ~$0.30-0.50
