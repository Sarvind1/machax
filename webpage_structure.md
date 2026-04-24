# webpage structure — machax.xyz

## pages

### `/` — landing page
the waitlist + marketing page. already live.

- **topbar**: logo (machax + cup SVG), pills ("beta · invite only", "made in Bengaluru")
- **hero section**: headline ("why can't you just... decide?"), subtext, waitlist email form, counter ("2,847+ overthinkers in the queue"), "try it now →" button linking to /chat
- **chat demo**: tabbed mock conversations ("should I quit?", "pay cut dilemma") with animated bubbles showing all 5 agent personas (Fomo, Didi, Boss, Hype, You)
- **aside**: "you vent. they triage." explanation, 4-step process (dump → deliberate → done → follow through), integration chips (Notion, WhatsApp, XP, Priorities)
- **closing CTA**: second waitlist form + "try it now →" button
- **footer**: logo, "© 2026 · Bengaluru"

geo-routing: middleware detects country via x-vercel-ip-country header. india gets hindi-inflected copy ("kyun nahi ho rahi padhai?"), rest of world gets english.

**files**: `src/app/page.tsx` (server component, reads geo cookie), `src/app/home-page.tsx` (client component with all UI), `src/app/globals.css`

### `/chat` — the group chat (main product)
the core experience. v1 matcha lounge design.

**states**:

1. **landing state** (no active conversation):
   - centered "what's on your mind?" heading (serif italic)
   - large text input ("type it out...")
   - starter prompt chips below (career, relationship, money, feelings, etc.)
   - provider status dots (green/gray for each AI provider)
   - sidebar with recent conversations list

2. **active chat state** (conversation in progress):
   - **left sidebar (260px)**: logo, pod members with presence dots (green=active, green-dim=joined, gray=lurking), recent conversations, "+ new chat" button
   - **center (flex)**: chat header ("the lounge", friend count, active provider label), scrollable message area, typing indicator ("tanmay and dev are typing..."), composer input
   - **right panel (320px)**: "the drill-down" — decision options extracted from the conversation. each option card shows label, blurb, which friends voiced it. "pick one" button. "only you see this" note.

3. **mobile (<768px)**: single column. sidebar hidden. decision panel becomes bottom sheet toggle.

**files**: `src/app/chat/page.tsx` (error boundary wrapper), `src/app/chat/chat-page.tsx` (main client component), `src/app/chat/chat.css`

**components**:
- `src/app/chat/components/chat-message.tsx` — bubble with friend colors, reply-to indicator, system messages
- `src/app/chat/components/chat-composer.tsx` — auto-growing textarea, enter to submit
- `src/app/chat/components/decision-panel.tsx` — right sidebar with option cards
- `src/app/chat/components/friend-pill.tsx` — colored pill with avatar initial
- `src/app/chat/components/typing-indicator.tsx` — animated dots, multi-agent names
- `src/app/chat/components/agent-presence.tsx` — online/offline cycling (built, not yet wired)
- `src/app/chat/components/reveal-text.tsx` — word-by-word text reveal (built, not yet wired)

### `/api/chat` — SSE streaming endpoint
POST. accepts `{ message, podFriendIds, history }`. streams newline-delimited JSON events:
- `{ provider: "Claude CLI (Haiku)" }` — which AI provider is active
- `{ typing: "dev" }` — agent started typing
- `{ from: "dev", text: "...", replyTo: "tanmay" }` — agent message with optional threading
- `{ joined: "tanmay" }` — agent came online mid-conversation
- `{ lurking: "kabir" }` — agent is reading but silent
- `{ presence: { agentId, state } }` — presence state change
- `{ nudge: true }` — agent asked user a question
- `{ windingDown: true }` — conversation is settling
- `{ decision: { question, options } }` — extracted decision options
- `{ done: true }` — stream complete

**file**: `src/app/api/chat/route.ts`

### `/api/providers` — provider health check
GET. returns which AI providers are available and which is active.

**file**: `src/app/api/providers/route.ts`

## navigation flow

```
machax.xyz (landing)
  ├─ "try it now →" button ──→ /chat (landing state)
  ├─ waitlist form ──→ saves to convex, shows toast
  └─ /chat
       ├─ type or pick starter ──→ creates conversation ──→ chat state
       ├─ sidebar: click recent conversation ──→ loads that chat
       ├─ sidebar: "+ new chat" ──→ back to landing state
       └─ logo click ──→ / (back to landing page)
```

## design system (v1 matcha lounge)

**palette**:
- paper: #F4F1E8 (warm off-white)
- ink: #1E1C16, inkSoft: #5A554A, inkFaint: #8A8374
- matcha: #6BAE7E, matchaDeep: #3E7A50
- rule: rgba(30,28,22,0.12)
- each friend has unique color, tintBg, tintInk

**typography**:
- display/headings: Fraunces (serif, italic)
- body/UI: Space Grotesk
- labels/meta: JetBrains Mono
- handwriting: Caveat

## backend

**convex tables**:
- `waitlist` — email, joinedAt (landing page)
- `conversations` — title, tag, podFriendIds, createdAt
- `messages` — conversationId, from, text, timestamp
- `decisions` — conversationId, question, options, selectedOptionId, createdAt

**AI orchestration**: `src/lib/orchestrator.ts` — v3 conversation engine with scoring-based replies, attention windows, presence lifecycle, energy decay

**characters**: `src/lib/friends.ts` — 100 characters across 7 categories, 17 conversational modes, personality traits (AgentTraits)

**providers**: `src/lib/providers.ts` — multi-provider with priority fallback (claude-cli > gemini > openai > anthropic)
