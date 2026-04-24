# learnings — machax build

things we learned building this, the hard way.

## claude cli piggybacking

- `claude -p` spawns a full subprocess with ~12s cold start per call
- `--system-prompt` flag replaces the entire default system prompt (suppresses CLAUDE.md injection) while keeping OAuth auth
- `--bare` skips CLAUDE.md but also skips OAuth — needs ANTHROPIC_API_KEY
- use `exec` (async) not `execSync` for parallel calls
- gemini-2.0-flash was deprecated → use gemini-2.5-flash

## multi-provider fallback

- priority: claude-cli > gemini > openai > anthropic
- probe all providers at startup via `/api/providers`
- show green/gray dots on landing so user sees what's available
- on vercel, claude CLI isn't available → auto-falls to gemini

## making AI feel human (not AI slop)

- **character sheets > role assignment** — write facts ("priya overshares about herself before helping"), not instructions ("be casual")
- **response type hierarchy** — react > question > relate > joke > emoji. NEVER advise
- **hard token caps** — 15-60 tokens for most responses. real group chat messages average 6-10 words
- **temperature 0.95** for variety
- **few-shot examples** in system prompts outperform any amount of instruction
- **assign incompatible priors** for natural disagreement — don't tell agents to "disagree"

## conversation engine architecture (v3)

### what didn't work:
- **rigid waves** (2+2+1) — felt like AI taking turns
- **random dropout** — absence felt artificial, not intentional
- **fixed reply percentages** (40% original, 30% latest) — statistically correct, psychologically wrong
- **hard pauses** on questions — felt like chatbot UX, not group chat
- **round-based flow** — users feel the batching

### what works:
- **scoring-based reply selection** — +3 name mention, +2 question, +2 disagreement, -replies penalty
- **attention windows** — impulsive agents see last 2 msgs, thoughtful see all
- **presence lifecycle** — offline → lurking → active → fading
- **energy decay** — starts 1.0, drops 0.10-0.15/msg, user replies add +0.3
- **behavioral dropout** — agents skip if nothing to add, not random removal
- **participant list in prompt** — enables natural direct addressing
- **tangent probability** — sometimes null out the reply target so agents drift
- **trait-aware mode selection** — don't assign "hype" to a contrarian

## convex setup

- two deployments: dev (`fiery-ocelot-22`) and prod (`compassionate-basilisk-625`)
- vercel has prod convex URL, local has dev
- `npx convex deploy --yes` for prod, `npx convex dev` for local
- adding tables doesn't break existing ones — waitlist coexists with chat tables

## deployment

- `./deploy.sh "message"` — git + convex prod + vercel prod in one command
- `./dev.sh` — convex dev + next.js dev in parallel, ctrl+c kills both
- always deploy convex functions before vercel (schema must exist before frontend hits it)

## MaaS rubric notes

- real output (20x) + observability (7x) + org structure (5x) = 78% of base points
- observability is tool-agnostic — langfuse, custom dashboard, sqlite+react all score the same
- "a team that built observability themselves in 90 minutes and hit L4 is scored exactly the same as a team that wired Langfuse and hit L4"
- decision panel = UI component, not an agent. user picks, no agent picks for them
