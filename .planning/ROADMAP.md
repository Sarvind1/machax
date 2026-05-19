# Roadmap

## Milestone: chat-realism-context-fixes

Two structural fixes to the chat engine, derived from research synthesis on multi-agent role-play systems and verified failure modes in prod chats `j976z9282c94bcvbzt05qvzfc18716my` and `j97c4148rh5mx9p407ys6knphs871p7d`.

### Phase 1: Speaker-selection gate
**Goal:** Stop firing every bot every user turn. Replace pod-wide fanout with mention-detection + talkativeness × topic-fit + 3-responder cap.
**Mode:** mvp
**Requirements:** CHAT-01
**Success Criteria:**
1. A single user message fires 1–3 bots, not the whole pod
2. Mentioning a character by name forces that character to respond
3. Per-character talkativeness is configurable; sensible defaults for the 13 core characters
4. Existing SSE streaming, traces, media, and reply flows still work end-to-end

### Phase 2: Per-character private memory
**Goal:** Each character only sees context they participated in (their own messages + messages addressed to or mentioning them). Retrieval scored as recency × importance × relevance instead of dumping raw transcript.
**Mode:** mvp
**Requirements:** CHAT-02
**Success Criteria:**
1. Each character's per-turn context is a filtered view, not the full conversation
2. Filter rule: character sees messages they sent, messages where they were addressed (replyTo) or mentioned by name, and a compressed summary of the rest
3. Retrieval scoring uses recency × importance × relevance for older content
4. Phase 1 speaker-gate continues to work; no regression in cap or mention detection

---
*Last updated: 2026-05-19*
