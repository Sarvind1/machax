# Observability Traces + Eval System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent trace logging for every conversation and an eval system with a curated prompt set, structured scoring, and two admin UI pages to view traces and eval results.

**Architecture:** The orchestrator collects trace data internally as it runs (iteration scores, agent selections, timing, energy). At the end of each conversation, it yields a `trace` EngineEvent with the full payload. The chat page saves this to Convex, following the existing pattern (frontend saves everything). Two new admin pages at `/admin/traces` and `/admin/evals` display the data. The eval runner extends the existing `simulate-chat.ts` to output structured JSON scores and save to Convex.

**Tech Stack:** Convex (schema + mutations + queries), Next.js App Router pages, custom CSS (no Tailwind utility classes, no shadcn — follow existing `chat.css` / `configure.css` patterns), Gemini 2.5 Flash for eval scoring.

**Key constraint:** This project uses custom CSS variables and hand-written styles. See `src/app/globals.css` for the design system (`--bg`, `--ink`, `--muted`, `--card`, `--line`, `--accent`, `--matcha`). All admin pages must use these variables. No component libraries.

---

## File map

### New files

| File | Responsibility |
|------|---------------|
| `convex/traces.ts` | Mutations + queries for conversation traces |
| `convex/evals.ts` | Mutations + queries for eval runs + results |
| `src/app/admin/traces/page.tsx` | Traces list + detail view |
| `src/app/admin/traces/admin-traces.css` | Styles for traces page |
| `src/app/admin/evals/page.tsx` | Eval runs list + results view |
| `src/app/admin/evals/admin-evals.css` | Styles for evals page |
| `scripts/eval-prompts.json` | Curated eval prompt set (15 prompts with expected properties) |
| `scripts/run-evals.ts` | Eval runner script — runs prompts, scores, saves to Convex |

### Modified files

| File | What changes |
|------|-------------|
| `convex/schema.ts` | Add `traces` and `evalRuns` and `evalResults` tables |
| `src/lib/engine-types.ts` | Add `trace` event type to `EngineEvent` union |
| `src/lib/orchestrator.ts` | Collect trace data during run, yield `trace` event before `done` |
| `src/app/api/chat/route.ts` | Pass through `trace` event in SSE translation |
| `src/app/chat/chat-page.tsx` | Save trace data to Convex when received |

---

## Task 1: Convex schema + trace/eval tables (SEQUENTIAL — must complete before Tasks 2-5)

This task adds all three new Convex tables and their mutations/queries. Must be done first because everything else depends on the schema.

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/traces.ts`
- Create: `convex/evals.ts`

- [ ] **Step 1: Add tables to schema.ts**

Add these three tables after the existing `decisions` table in `convex/schema.ts`:

```typescript
  traces: defineTable({
    conversationId: v.optional(v.id("conversations")),
    prompt: v.string(),
    userName: v.string(),
    podFriendIds: v.array(v.string()),
    provider: v.string(),
    sessionMood: v.optional(v.string()),
    totalTimeMs: v.number(),
    totalIterations: v.number(),
    totalMessages: v.number(),
    finalEnergy: v.number(),
    iterations: v.string(), // JSON stringified array of iteration trace objects
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  evalRuns: defineTable({
    name: v.string(),
    promptCount: v.number(),
    avgScore: v.optional(v.number()),
    status: v.string(), // "running" | "complete" | "failed"
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  evalResults: defineTable({
    evalRunId: v.id("evalRuns"),
    prompt: v.string(),
    messages: v.string(), // JSON stringified message array
    scores: v.string(), // JSON stringified score object
    overallScore: v.number(),
    totalTimeMs: v.number(),
    messageCount: v.number(),
    createdAt: v.number(),
  }).index("by_run", ["evalRunId"]),
```

- [ ] **Step 2: Create convex/traces.ts**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    prompt: v.string(),
    userName: v.string(),
    podFriendIds: v.array(v.string()),
    provider: v.string(),
    sessionMood: v.optional(v.string()),
    totalTimeMs: v.number(),
    totalIterations: v.number(),
    totalMessages: v.number(),
    finalEnergy: v.number(),
    iterations: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("traces", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("traces")
      .withIndex("by_created")
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("traces") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
```

- [ ] **Step 3: Create convex/evals.ts**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createRun = mutation({
  args: {
    name: v.string(),
    promptCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evalRuns", {
      ...args,
      status: "running",
      createdAt: Date.now(),
    });
  },
});

export const completeRun = mutation({
  args: {
    id: v.id("evalRuns"),
    avgScore: v.number(),
    status: v.string(),
  },
  handler: async (ctx, { id, avgScore, status }) => {
    await ctx.db.patch(id, { avgScore, status });
  },
});

export const saveResult = mutation({
  args: {
    evalRunId: v.id("evalRuns"),
    prompt: v.string(),
    messages: v.string(),
    scores: v.string(),
    overallScore: v.number(),
    totalTimeMs: v.number(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evalResults", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("evalRuns")
      .withIndex("by_created")
      .order("desc")
      .take(20);
  },
});

export const getRunResults = query({
  args: { evalRunId: v.id("evalRuns") },
  handler: async (ctx, { evalRunId }) => {
    return await ctx.db
      .query("evalResults")
      .withIndex("by_run", (q) => q.eq("evalRunId", evalRunId))
      .collect();
  },
});
```

- [ ] **Step 4: Run Convex dev to verify schema compiles**

Run: `npx convex dev --once` (or check that the dev server picks up the schema change without errors).

Expected: No schema errors. New tables recognized.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/traces.ts convex/evals.ts
git commit -m "feat: add Convex schema + mutations for traces and evals"
```

---

## Task 2: Instrument orchestrator to collect + yield trace data (SEQUENTIAL — must complete before Tasks 3-5)

Add trace data collection inside the orchestrator loop and yield it as a new `trace` EngineEvent.

**Files:**
- Modify: `src/lib/engine-types.ts`
- Modify: `src/lib/orchestrator.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add trace event type to engine-types.ts**

Add this to the `EngineEvent` union type in `src/lib/engine-types.ts`, before the `done` event:

```typescript
  | { type: "trace"; data: ConversationTrace }
```

And add this interface at the bottom of the file:

```typescript
// Trace data collected during a conversation run
export interface IterationTrace {
  iteration: number;
  energy: number;
  candidateCount: number;
  selectedAgents: {
    agentId: string;
    score: number;
    targetFrom: string;
    targetText: string;
    delay: number;
    responseText?: string;
    responseTimeMs?: number;
    failed?: boolean;
  }[];
  skippedAgents: { agentId: string; reason: string }[];
  energyAfter: number;
}

export interface ConversationTrace {
  prompt: string;
  userName: string;
  podFriendIds: string[];
  provider: string;
  sessionMood?: string;
  totalTimeMs: number;
  totalIterations: number;
  totalMessages: number;
  finalEnergy: number;
  iterations: IterationTrace[];
}
```

- [ ] **Step 2: Collect trace data in orchestrator.ts**

Inside `orchestrateChat()`, after the energy/phase initialization block (around line 1120), add:

```typescript
  // ── Trace collection ──
  const traceIterations: import("./engine-types").IterationTrace[] = [];
  const traceStartTime = Date.now();
```

Inside the main while loop, at the start of each iteration (after `iterations++` on line 1146), add:

```typescript
    const iterTrace: import("./engine-types").IterationTrace = {
      iteration: iterations,
      energy: parseFloat(energy.toFixed(3)),
      candidateCount: 0,
      selectedAgents: [],
      skippedAgents: [],
      energyAfter: 0,
    };
```

After `scoredCandidates` is populated (around line 1209), set:

```typescript
    iterTrace.candidateCount = candidates.length;
```

For agents that were candidates but didn't make it to `scoredCandidates`, track them. After the scoring loop (after line 1209), before the `if (scoredCandidates.length === 0)` check, add:

```typescript
    // Track which candidates didn't score high enough
    for (const agent of candidates) {
      if (!scoredCandidates.some(sc => sc.agent.id === agent.id)) {
        iterTrace.skippedAgents.push({ agentId: agent.id, reason: "low-score-or-dropout" });
      }
    }
```

When processing results (inside the for loop at line 1271), for each successful result, update the corresponding selectedAgent entry. Before the existing result processing, when building the batch (after line 1232), record selected agents:

```typescript
    for (const { agent, target, delay } of batch) {
      iterTrace.selectedAgents.push({
        agentId: agent.id,
        score: target.score,
        targetFrom: target.from,
        targetText: target.text.slice(0, 80),
        delay: Math.round(delay),
      });
    }
```

After processing each result successfully (after `roundResponses.push(entry)` on line 1324), update the trace:

```typescript
      // Update trace with response
      const traceAgent = iterTrace.selectedAgents.find(a => a.agentId === agent.id);
      if (traceAgent) {
        traceAgent.responseText = entry.text.slice(0, 120);
        traceAgent.responseTimeMs = Date.now() - traceStartTime;
      }
```

For failed results (in the error catch on line 1274), mark them:

```typescript
      const failedAgent = iterTrace.selectedAgents.find(a => a.agentId === batch[i].agent.id);
      if (failedAgent) failedAgent.failed = true;
```

At the end of each iteration (just before the while loop closes), record final energy:

```typescript
    iterTrace.energyAfter = parseFloat(energy.toFixed(3));
    traceIterations.push(iterTrace);
```

- [ ] **Step 3: Yield trace event before done**

Right before the final `yield { type: "done" }` at the end of `orchestrateChat()`, yield the trace:

```typescript
  // ── Yield trace data ──
  yield {
    type: "trace",
    data: {
      prompt: message,
      userName,
      podFriendIds,
      provider: provider.label,
      sessionMood: sessionMood ? JSON.stringify(sessionMood) : undefined,
      totalTimeMs: Date.now() - traceStartTime,
      totalIterations: iterations,
      totalMessages: roundResponses.length,
      finalEnergy: parseFloat(energy.toFixed(3)),
      iterations: traceIterations,
    },
  };
```

- [ ] **Step 4: Update API route to translate trace event**

In `src/app/api/chat/route.ts`, add a case for `trace` in the `translateEvent` function:

```typescript
    case "trace":
      return { trace: event.data };
```

- [ ] **Step 5: Test by running the simulator**

Run: `FORCE_GEMINI=1 npx tsx scripts/simulate-chat.ts "Should I learn Rust?"`

Check the console output — you should see a `trace` event logged at the end. The simulator already has a default case handler that prints unknown event types.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine-types.ts src/lib/orchestrator.ts src/app/api/chat/route.ts
git commit -m "feat: instrument orchestrator with trace data collection"
```

---

## Task 3: Save trace from chat-page + admin traces UI (PARALLEL after Tasks 1-2)

Wire the chat frontend to save trace data, then build the traces admin page.

**Files:**
- Modify: `src/app/chat/chat-page.tsx`
- Create: `src/app/admin/traces/page.tsx`
- Create: `src/app/admin/traces/admin-traces.css`

**Important styling rules:**
- Use custom CSS in a dedicated `.css` file, imported at the top of the page component
- Use CSS variables from `globals.css`: `--bg`, `--ink`, `--muted`, `--card`, `--line`, `--accent`, `--matcha`, `--matcha-light`, `--matcha-foam`
- Font variables: `var(--font-body)` for body text, `var(--font-mono)` for code/data, `var(--font-serif)` for headings
- No Tailwind utility classes. No shadcn. Hand-written CSS only.
- Follow the layout patterns in `src/app/configure/configure.css` and `src/app/chat/chat.css`

- [ ] **Step 1: Read chat-page.tsx to find where SSE events are processed**

Read `src/app/chat/chat-page.tsx` and find where the SSE stream is consumed and where messages/decisions are saved to Convex. You need to add trace handling in the same event processing loop.

- [ ] **Step 2: Add trace saving to chat-page.tsx**

In the SSE event processing section of `chat-page.tsx`, add a handler for the `trace` field. When the SSE event contains `trace`, call the Convex mutation to save it:

```typescript
if (parsed.trace) {
  // Save trace to Convex (fire and forget)
  saveTrace({
    conversationId: conversationId,
    prompt: parsed.trace.prompt,
    userName: parsed.trace.userName,
    podFriendIds: parsed.trace.podFriendIds,
    provider: parsed.trace.provider,
    sessionMood: parsed.trace.sessionMood,
    totalTimeMs: parsed.trace.totalTimeMs,
    totalIterations: parsed.trace.totalIterations,
    totalMessages: parsed.trace.totalMessages,
    finalEnergy: parsed.trace.finalEnergy,
    iterations: JSON.stringify(parsed.trace.iterations),
  });
}
```

You'll need to add the mutation hook at the top of the component:

```typescript
const saveTrace = useMutation(api.traces.save);
```

- [ ] **Step 3: Create admin traces page**

Create `src/app/admin/traces/page.tsx` — a "use client" page that shows:

**Left panel (list):** All traces sorted by newest first. Each row shows:
- Prompt (truncated to 50 chars)
- Timestamp (relative: "2m ago", "1h ago")
- Message count badge
- Provider label
- Total time

**Right panel (detail):** When a trace is selected, show:
- Full prompt
- Pod members (colored pills using character colors from friends.ts — import `FRIENDS_BY_ID` from `@/lib/friends`)
- Summary stats: total time, iterations, messages, final energy
- **Iteration timeline:** For each iteration, show:
  - Iteration number + energy level (with a simple bar visualization)
  - Selected agents with their scores, what they replied to, and their response text
  - Skipped agents and reasons
  - Energy after

Use `useQuery(api.traces.list)` for the list, and `useQuery(api.traces.get, { id })` for the detail.

Parse the `iterations` field with `JSON.parse()` to get the iteration array.

The page should work without authentication — it's an internal admin tool.

- [ ] **Step 4: Create admin-traces.css**

Style the admin page. Key patterns:
- Two-panel layout with `display: grid; grid-template-columns: 340px 1fr;` and `height: 100vh`
- Left panel: scrollable list, each item a card-like row with hover highlight
- Right panel: scrollable detail area with sections
- Use `--card` for backgrounds, `--line` for borders, `--muted` for secondary text
- Iteration timeline: use a left-border accent line for visual continuity
- Energy bars: simple `<div>` with percentage width, background `var(--matcha)`
- Agent score badges: small inline pills

- [ ] **Step 5: Test the full flow**

1. Start the dev server (via `./dev.sh`)
2. Open `/chat`, send a message, wait for conversation to complete
3. Open `/admin/traces` — the new trace should appear in the list
4. Click it — detail panel should show iterations, agents, scores

- [ ] **Step 6: Commit**

```bash
git add src/app/chat/chat-page.tsx src/app/admin/traces/page.tsx src/app/admin/traces/admin-traces.css
git commit -m "feat: traces admin page with iteration timeline"
```

---

## Task 4: Eval prompts + eval runner script (PARALLEL after Tasks 1-2)

Create the curated eval prompt set and a runner script that executes them, scores with structured JSON, and saves to Convex.

**Files:**
- Create: `scripts/eval-prompts.json`
- Create: `scripts/run-evals.ts`

- [ ] **Step 1: Create eval-prompts.json**

Create `scripts/eval-prompts.json` with 15 prompts spanning different conversation types. Each prompt has expected properties the conversation should exhibit:

```json
[
  {
    "prompt": "Should I quit my job to start a startup?",
    "expectedTraits": ["disagreement", "practical-advice", "personal-stories"],
    "category": "career",
    "difficulty": "standard"
  },
  {
    "prompt": "Pizza or burger?",
    "expectedTraits": ["casual-banter", "strong-opinions", "humor"],
    "category": "casual",
    "difficulty": "easy"
  },
  {
    "prompt": "I think I'm in love with my best friend",
    "expectedTraits": ["empathy", "varied-perspectives", "personal-advice"],
    "category": "relationships",
    "difficulty": "standard"
  },
  {
    "prompt": "Is crypto still worth investing in?",
    "expectedTraits": ["disagreement", "factual-claims", "caution"],
    "category": "finance",
    "difficulty": "standard"
  },
  {
    "prompt": "My parents want me to do an MBA but I want to be an artist",
    "expectedTraits": ["empathy", "cultural-context", "disagreement", "personal-stories"],
    "category": "life",
    "difficulty": "standard"
  },
  {
    "prompt": "Rate my startup idea: Uber for dog walking",
    "expectedTraits": ["humor", "practical-advice", "constructive-criticism"],
    "category": "startup",
    "difficulty": "standard"
  },
  {
    "prompt": "bored",
    "expectedTraits": ["casual-banter", "humor", "engagement"],
    "category": "minimal",
    "difficulty": "hard"
  },
  {
    "prompt": "What phone should I buy under 30k?",
    "expectedTraits": ["specific-recommendations", "disagreement", "practical-advice"],
    "category": "shopping",
    "difficulty": "easy"
  },
  {
    "prompt": "I got rejected from my dream college",
    "expectedTraits": ["empathy", "encouragement", "personal-stories"],
    "category": "emotional",
    "difficulty": "standard"
  },
  {
    "prompt": "Should I move to Bangalore or stay in my hometown?",
    "expectedTraits": ["cultural-context", "practical-advice", "varied-perspectives"],
    "category": "life",
    "difficulty": "standard"
  },
  {
    "prompt": "Hot take: arranged marriages are better than love marriages",
    "expectedTraits": ["strong-disagreement", "cultural-context", "humor", "heated-debate"],
    "category": "controversial",
    "difficulty": "hard"
  },
  {
    "prompt": "I just found out my coworker makes 2x my salary for the same role",
    "expectedTraits": ["empathy", "practical-advice", "strong-opinions"],
    "category": "career",
    "difficulty": "standard"
  },
  {
    "prompt": "hi",
    "expectedTraits": ["engagement", "casual-banter", "not-awkward"],
    "category": "minimal",
    "difficulty": "hard"
  },
  {
    "prompt": "Is AI going to take all our jobs?",
    "expectedTraits": ["varied-perspectives", "factual-claims", "humor", "disagreement"],
    "category": "tech",
    "difficulty": "standard"
  },
  {
    "prompt": "I want to learn cooking but I burn everything",
    "expectedTraits": ["humor", "practical-advice", "encouragement", "personal-stories"],
    "category": "casual",
    "difficulty": "easy"
  }
]
```

- [ ] **Step 2: Create run-evals.ts**

Create `scripts/run-evals.ts`. This script:
1. Loads env from `.env.local` (copy the pattern from `simulate-chat.ts`)
2. Reads `eval-prompts.json`
3. Creates an eval run in Convex via HTTP mutation
4. For each prompt: runs `orchestrateChat()`, collects messages, scores with Gemini (structured JSON), saves result to Convex
5. Computes avg score and marks run complete

The scoring prompt should return structured JSON. Modify the existing reviewer approach from `simulate-chat.ts`:

```typescript
const SCORE_PROMPT = `You are a quality reviewer for MachaX, an AI group chat app.
Evaluate this conversation and return ONLY valid JSON (no markdown, no explanation).

Return this exact shape:
{
  "naturalness": { "score": 1-10, "note": "one sentence" },
  "relevance": { "score": 1-10, "note": "one sentence" },
  "engagement": { "score": 1-10, "note": "one sentence" },
  "variety": { "score": 1-10, "note": "one sentence" },
  "pacing": { "score": 1-10, "note": "one sentence" },
  "length": { "score": 1-10, "note": "one sentence" },
  "completeness": { "score": 1-10, "note": "one sentence" },
  "entertainment": { "score": 1-10, "note": "one sentence" },
  "overall": 1-10
}

Criteria:
- NATURALNESS: Sounds like real friends texting? Or robotic/generic?
- RELEVANCE: Agents actually address the prompt?
- ENGAGEMENT: Agents address the user, ask follow-ups? Or just talk among themselves?
- VARIETY: Different characters have distinct voices?
- PACING: Right number of messages? Not too many, not too few?
- LENGTH: Messages are group-chat length (1-2 sentences mostly)?
- COMPLETENESS: No truncated or fragment responses?
- ENTERTAINMENT: Fun to read? Creates engagement?

Be brutally honest. Score 1-10 for each.`;
```

For Convex HTTP mutations, use the Convex HTTP client:

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
```

The main loop:

```typescript
async function main() {
  const prompts = JSON.parse(readFileSync(resolve(projectRoot, "scripts/eval-prompts.json"), "utf-8"));
  const runName = `eval-${new Date().toISOString().slice(0, 16)}`;

  const runId = await client.mutation(api.evals.createRun, {
    name: runName,
    promptCount: prompts.length,
  });

  console.log(`\nEval run: ${runName} (${prompts.length} prompts)\n`);

  let totalScore = 0;
  let completed = 0;

  for (const evalPrompt of prompts) {
    console.log(`[${completed + 1}/${prompts.length}] "${evalPrompt.prompt}"`);

    try {
      const startTime = Date.now();
      const pod = selectPod(["life", "career", "relationships", "feelings"]);
      const podIds = pod.map((f: any) => f.id);

      // Run conversation
      const messages: { from: string; text: string }[] = [];
      const generator = orchestrateChat({
        message: evalPrompt.prompt,
        podFriendIds: podIds,
        history: [],
        userName: "TestUser",
      });

      for await (const event of generator) {
        if (event.type === "message") {
          messages.push({ from: event.from, text: event.text });
        }
      }

      const totalTimeMs = Date.now() - startTime;

      // Score with Gemini
      const transcript = messages
        .map((m) => `[${m.from}] ${m.text}`)
        .join("\n");

      const scoreResult = await generateText({
        model: google("gemini-2.5-flash"),
        messages: [
          {
            role: "user",
            content: `${SCORE_PROMPT}\n\nUser prompt: "${evalPrompt.prompt}"\n\nConversation:\n${transcript}`,
          },
        ],
        maxOutputTokens: 800,
        temperature: 0.1,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });

      // Parse JSON score
      let scores;
      try {
        let cleaned = scoreResult.text.trim()
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
        const startIdx = cleaned.indexOf("{");
        const endIdx = cleaned.lastIndexOf("}");
        if (startIdx >= 0 && endIdx > startIdx) {
          cleaned = cleaned.slice(startIdx, endIdx + 1);
        }
        scores = JSON.parse(cleaned);
      } catch {
        console.error("  Failed to parse score JSON, using defaults");
        scores = { overall: 5 };
      }

      const overallScore = scores.overall ?? 5;
      totalScore += overallScore;
      completed++;

      console.log(`  Score: ${overallScore}/10 | ${messages.length} msgs | ${(totalTimeMs / 1000).toFixed(1)}s`);

      // Save to Convex
      await client.mutation(api.evals.saveResult, {
        evalRunId: runId,
        prompt: evalPrompt.prompt,
        messages: JSON.stringify(messages),
        scores: JSON.stringify(scores),
        overallScore,
        totalTimeMs,
        messageCount: messages.length,
      });
    } catch (err) {
      console.error(`  FAILED:`, err);
      completed++;
    }
  }

  // Complete the run
  const avgScore = completed > 0 ? parseFloat((totalScore / completed).toFixed(1)) : 0;
  await client.mutation(api.evals.completeRun, {
    id: runId,
    avgScore,
    status: "complete",
  });

  console.log(`\nDone. Avg score: ${avgScore}/10 across ${completed} prompts.`);
}
```

- [ ] **Step 3: Test the eval runner**

Run: `FORCE_GEMINI=1 npx tsx scripts/run-evals.ts`

It should process all 15 prompts, print scores, and save to Convex. Expect it to take 3-5 minutes total.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-prompts.json scripts/run-evals.ts
git commit -m "feat: eval runner with structured scoring and Convex persistence"
```

---

## Task 5: Admin evals UI page (PARALLEL after Tasks 1-2)

Build the eval results admin page.

**Files:**
- Create: `src/app/admin/evals/page.tsx`
- Create: `src/app/admin/evals/admin-evals.css`

**Styling rules:** Same as Task 3 — custom CSS, use design system variables, no Tailwind utility classes, no shadcn.

- [ ] **Step 1: Create admin evals page**

Create `src/app/admin/evals/page.tsx` — a "use client" page that shows:

**Top section (runs list):** All eval runs sorted by newest first. Each row shows:
- Run name
- Status badge ("running" = yellow, "complete" = green, "failed" = red)
- Prompt count
- Average score (with color: red < 5, yellow 5-7, green > 7)
- Timestamp

**Bottom section (results detail):** When a run is selected, show a results table:
- One row per prompt
- Columns: Prompt, Overall Score (color-coded), Message Count, Time, and expandable detail
- When a row is expanded, show:
  - Individual criterion scores (naturalness, relevance, etc.) as a horizontal bar chart
  - The reviewer's note for each criterion
  - The full conversation transcript (each message with the character name colored using their color from friends.ts)

Use `useQuery(api.evals.listRuns)` for the runs list and `useQuery(api.evals.getRunResults, { evalRunId })` for the results.

Parse `scores` and `messages` fields with `JSON.parse()`.

For character colors, import `FRIENDS_BY_ID` from `@/lib/friends` and use `FRIENDS_BY_ID[message.from]?.color` for styling.

- [ ] **Step 2: Create admin-evals.css**

Style the evals page:
- Single-column layout with max-width 1100px centered
- Runs list at top as card rows
- Results table below with expandable rows
- Score bars: simple `<div>` bars, 10 segments, colored ones filled based on score
- Transcript section: each message as a row with a colored left-border matching the character's color
- Status badges: small pills with background colors

- [ ] **Step 3: Test the page**

1. Ensure you've run `scripts/run-evals.ts` at least once so there's data in Convex
2. Open `/admin/evals`
3. Verify the run appears in the list with avg score
4. Click to expand — verify results table with scores and transcripts

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/evals/page.tsx src/app/admin/evals/admin-evals.css
git commit -m "feat: eval results admin page with score visualization"
```

---

## Execution dependencies

```
Task 1 (schema)
    ↓
Task 2 (orchestrator instrumentation)
    ↓
┌─────────────────┬──────────────────┬──────────────────┐
│ Task 3           │ Task 4           │ Task 5           │
│ (traces UI +     │ (eval runner     │ (evals UI)       │
│  chat-page save) │  script)         │                  │
└─────────────────┴──────────────────┴──────────────────┘
        ↑ PARALLEL — these three can run simultaneously ↑
```
