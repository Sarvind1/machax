# machax agent control levers

a comprehensive map of every tunable parameter in the conversation engine. organized by scope (global, per-agent, pod, response quality, interaction patterns) with current values, valid ranges, code locations, and dashboard UI suggestions.

---

## 1. global conversation controls

levers that affect the entire conversation flow, energy, and lifecycle.

### 1.1 max messages per conversation (MAX_ITERATIONS)

- **current value**: `10`
- **range**: 1-30 (practical range 5-15)
- **file:line**: `src/lib/orchestrator.ts:805`
- **effect**: hard safety cap on how many agent messages a single user message can produce. the engine aims for 5-8 messages naturally via energy decay, but this prevents runaway loops. increasing it allows longer threads; decreasing it forces shorter, punchier exchanges.
- **dashboard UI**: slider (5-20)
- **user-facing vs admin**: admin-only. users shouldn't need to think about this — energy decay handles natural endings.

### 1.2 energy decay rate

- **current value**: `0.05 + random(0, 0.04)` per agent response (so ~0.05-0.09 per message)
- **range**: 0.01-0.2
- **file:line**: `src/lib/orchestrator.ts:984`
- **effect**: how fast the conversation runs out of steam. lower values = longer conversations with more agent messages. higher values = quick 3-4 message bursts. the randomness prevents robotic uniformity.
- **dashboard UI**: slider labeled "conversation length" (inverted — left = short/high decay, right = long/low decay)
- **user-facing vs admin**: could be user-facing as a "conversation depth" preference. "quick takes" vs "deep discussion".

### 1.3 energy floor (ENERGY_FLOOR)

- **current value**: `0.15`
- **range**: 0.0-0.5
- **file:line**: `src/lib/orchestrator.ts:804`
- **effect**: minimum energy level before the engine stops. at 0.15, conversations always get at least a few messages before dying. raising it to 0.3 would cut conversations shorter. setting to 0 would let energy drain completely (risky — could produce degenerate single-word endings).
- **dashboard UI**: slider labeled "minimum conversation energy"
- **user-facing vs admin**: admin-only.

### 1.4 energy recovery from questions

- **current value**: `+0.05` when an agent asks a question
- **range**: 0.0-0.15
- **file:line**: `src/lib/orchestrator.ts:989`
- **effect**: questions from agents inject a small energy boost, keeping the conversation alive when agents are curious. higher values make conversations self-sustaining through question chains. zero removes this mechanic entirely.
- **dashboard UI**: slider labeled "question energy boost"
- **user-facing vs admin**: admin-only.

### 1.5 silence energy drain

- **current value**: `-0.02` when no agent wants to respond in an iteration
- **range**: 0.0-0.1
- **file:line**: `src/lib/orchestrator.ts:865`
- **effect**: when nobody scores high enough to respond, the conversation still loses a tiny bit of energy. prevents infinite loops of silence.
- **dashboard UI**: slider
- **user-facing vs admin**: admin-only.

### 1.6 conversation phase thresholds

- **winding-down threshold**: energy < `0.3` triggers phase transition
- **closing-out threshold**: energy < `0.2` triggers ultra-short responses
- **fading agent threshold**: energy < `0.4` and response count >= fadeAfter
- **range**: 0.0-1.0 for each
- **file:line**: `src/lib/orchestrator.ts:996` (winding-down), `orchestrator.ts:615` (closing-out), `orchestrator.ts:308` (fading)
- **effect**: these thresholds control when the conversation shifts tone. agents start wrapping up, giving shorter responses, and some go offline. moving winding-down from 0.3 to 0.5 would make conversations feel more rushed.
- **dashboard UI**: three connected sliders or a single "conversation pacing" control
- **user-facing vs admin**: admin-only.

### 1.7 temperature

- **current value**: `1.2`
- **range**: 0.0-2.0
- **file:line**: `src/lib/orchestrator.ts:122`
- **effect**: controls randomness/creativity of model outputs. 1.2 is high — produces varied, unpredictable, human-like responses. lowering to 0.8 would make responses more predictable and "safe". going above 1.5 risks incoherence.
- **dashboard UI**: slider labeled "creativity/chaos" (0.5-1.8)
- **user-facing vs admin**: admin-only. dangerous for users to control directly.

### 1.8 top-p (nucleus sampling)

- **current value**: `0.9`
- **range**: 0.0-1.0
- **file:line**: `src/lib/orchestrator.ts:123`
- **effect**: works with temperature to control response diversity. 0.9 allows a wide vocabulary while filtering out the tail. lower values (0.7) would make responses more predictable.
- **dashboard UI**: slider (advanced section)
- **user-facing vs admin**: admin-only.

### 1.9 provider selection

- **current value**: priority-based fallback — claude-cli > gemini > openai > anthropic
- **file:line**: `src/lib/providers.ts:26-31`
- **models**:
  - claude-cli: `claude-haiku-4-5-20251001`
  - gemini: `gemini-2.5-flash`
  - openai: `gpt-4o-mini`
  - anthropic: `claude-haiku-4-5-20251001`
- **effect**: which AI model generates the responses. different models have different "personalities" — gemini tends to be more verbose, claude tends to be more concise. switching models changes the overall feel of conversations.
- **dashboard UI**: dropdown with available providers
- **user-facing vs admin**: admin-only. model choice affects cost and quality.

### 1.10 synthesis model

- **current value**: same as chat model (e.g., `gemini-2.5-flash`)
- **file:line**: `src/lib/providers.ts:73-97` (MODEL_MAP)
- **effect**: the model used for the decision synthesis pass at the end of a conversation. could be upgraded to a stronger model for better summaries without changing chat quality.
- **dashboard UI**: dropdown (separate from chat model)
- **user-facing vs admin**: admin-only.

### 1.11 thinking budget

- **current value**: `0` (disabled)
- **range**: 0-2048 tokens
- **file:line**: `src/lib/orchestrator.ts:127`
- **effect**: gemini's internal reasoning budget. currently disabled for speed. enabling it (e.g., 256) would make responses more considered but slower and more expensive.
- **dashboard UI**: toggle + slider
- **user-facing vs admin**: admin-only.

---

## 2. per-agent controls

levers that can be set individually for each of the 100 characters via the `AgentTraits` interface.

### 2.1 responseSpeed

- **type**: `"impulsive" | "normal" | "thoughtful"`
- **current values vary by character**: e.g., Simran = impulsive, Reeva = normal, Ananya = thoughtful
- **file:line**: `src/lib/engine-types.ts:4`
- **effect**: determines two things:
  1. **delay range** before responding (how fast they "type"):
     - impulsive: 1500-4000ms
     - normal: 4000-12000ms
     - thoughtful: 10000-25000ms
  2. **default attention window** (how many messages they read back):
     - impulsive: 5 messages
     - normal: 8 messages
     - thoughtful: 999 (reads everything)
  3. **context analysis**: thoughtful and normal agents get a "missing perspective" analysis pass; impulsive agents skip it (line 654)
- **dashboard UI**: dropdown per agent (3 options)
- **user-facing vs admin**: could be user-facing as a personality slider. "how fast does this person reply?"

### 2.2 interruptProbability

- **type**: number (0-1)
- **current range across characters**: 0.05 (Ananya) to 0.4 (category default for chaotic)
- **file:line**: `src/lib/engine-types.ts:5`
- **effect**: chance of cutting in before others finish. currently defined in traits but **not directly used in the v3 engine loop** — the scoring system replaced direct interrupt mechanics. this is a vestigial trait that could be reactivated.
- **dashboard UI**: slider (0-100%)
- **user-facing vs admin**: admin-only. would need engine changes to activate.

### 2.3 agreementBias

- **type**: number (-1 to 1)
- **current range**: -0.5 (provocative category default) to 0.6 (Simran)
- **file:line**: `src/lib/engine-types.ts:6`
- **effect**: controls whether the agent tends to agree or disagree:
  - **scoring**: contrarian agents (< 0) get +2 bonus score for finding disagreement opportunities (line 368-370)
  - **response filtering**: agents with agreementBias > 0.3 get -2 penalty when piling on already-replied messages (line 393-395)
  - **mode selection**: affects which conversation modes are eligible (line 1840-1848 in friends.ts) — contrarians can't get "hype" or "emotional-support", agreeable agents can't get "roast" or "dark-humor"
  - **prompt tone**: negative bias adds a "you don't have to agree" instruction (line 501-503)
- **dashboard UI**: slider labeled "contrarian <---> agreeable" (-1.0 to 1.0)
- **user-facing vs admin**: could be user-facing per character as a "personality dial".

### 2.4 verbosityRange

- **type**: `[min, max]` (word counts)
- **current range across characters**: [1, 8] (Ananya — the quiet one) to [8, 40] (several characters)
- **file:line**: `src/lib/engine-types.ts:7`
- **effect**: clamps the maxTokens for this agent. the engine picks a response length bucket (micro/short/medium/long/rant) and then clamps the token budget to roughly 1.5x the word range (lines 702-709). a character with [1, 8] will never produce a long response even if the length picker rolled "rant".
- **dashboard UI**: dual-handle range slider (min words, max words)
- **user-facing vs admin**: admin-only. this is a deep character tuning knob.

### 2.5 confidenceLevel

- **type**: number (0-1)
- **current range**: 0.4 (Rhea, Aarushi) to 0.7 (Tanmay)
- **file:line**: `src/lib/engine-types.ts:8`
- **effect**: defined in traits but **not directly used in the v3 engine** — intended for hedging vs assertive tone. could modulate prompt instructions (e.g., low confidence = "add qualifiers", high confidence = "state things as fact").
- **dashboard UI**: slider (0-100%)
- **user-facing vs admin**: admin-only. would need prompt integration to activate.

### 2.6 lurkerChance

- **type**: number (0-1)
- **current range**: 0.05 (chaotic default) to 0.5 (Ananya)
- **file:line**: `src/lib/engine-types.ts:9`
- **effect**: two uses:
  1. **presence initialization**: when an agent comes online, this is the probability they start in "lurking" state instead of "active" (line 302). lurking agents don't respond unless directly addressed or score high enough.
  2. **dropout rate**: contributes to the base dropout probability — `0.08 + lurkerChance * 0.5` (line 437). high lurkerChance means the agent frequently "reads but doesn't reply".
- **dashboard UI**: slider labeled "lurker tendency" (0-100%)
- **user-facing vs admin**: could be user-facing as "how chatty is this person?"

### 2.7 tangentProbability

- **type**: number (0-1), optional (defaults to 0.05)
- **current range**: 0.05 (default) to 0.4 (Jiya — the dreamer)
- **file:line**: `src/lib/engine-types.ts:10`, used at `orchestrator.ts:597-602`
- **effect**: chance that the agent ignores the scored reply target and goes off-topic instead. high tangent probability creates characters who randomly bring up unrelated things — Priya (0.35), Sonal (0.3), and Jiya (0.4) are the main tangent-prone characters.
- **dashboard UI**: slider labeled "randomness" (0-100%)
- **user-facing vs admin**: admin-only. affects conversation coherence.

### 2.8 attentionWindow

- **type**: number (messages), optional
- **current values**: not explicitly set on most characters — derived from responseSpeed (impulsive=5, normal=8, thoughtful=999)
- **file:line**: `src/lib/engine-types.ts:11`, resolved at `orchestrator.ts:251-254`
- **effect**: how many recent messages the agent can "see" when formulating a response. impulsive agents only see the last 5 messages (they skim). thoughtful agents read the entire history. this creates natural misunderstandings — an impulsive agent might miss context from 6 messages ago.
- **dashboard UI**: number input or slider (3-999)
- **user-facing vs admin**: admin-only.

### 2.9 defaultLength

- **type**: `"micro" | "short" | "medium" | "long"`
- **current distribution**: most characters are "medium", some are "short" (Ayesha, Kritika, Nisha), one is "micro" (Ananya)
- **file:line**: `src/lib/friends.ts` (per character definition)
- **effect**: the character's natural response length. gets a 3x weight boost in the length picker (line 1752). a "micro" character will usually send 1-3 word reactions, while a "long" character will write 15-30 word responses.
- **dashboard UI**: dropdown (micro/short/medium/long)
- **user-facing vs admin**: admin-only.

### 2.10 tags (topic affinities)

- **type**: string array
- **current tags used**: career, money, life, relationship, feelings, what-to-buy, hot-takes, food, tech, overthinking, family, travel, health, culture, music, movies
- **file:line**: `src/lib/friends.ts` (per character), affinity computed at `friends.ts:1708-1741`
- **effect**: determines which topics a character cares about. used in two ways:
  1. **pod selection**: characters with matching tags score higher and are more likely to be selected (line 1810)
  2. **response length**: high topic affinity (> 0.6) boosts long/rant weights 3x/2x. low affinity (< 0.3) boosts micro/short weights (lines 1770-1778)
- **dashboard UI**: multi-select tag picker
- **user-facing vs admin**: could be user-facing. "what does this character care about?"

### 2.11 category

- **type**: string
- **current categories**: emotional (18), analytical (17), chaotic (16), wise (13), practical (12), creative (12), provocative (12)
- **file:line**: `src/lib/friends.ts` (per character)
- **effect**: used for:
  1. **trait defaults**: if a character doesn't have explicit traits, category provides defaults (orchestrator.ts:193-237)
  2. **pod diversity**: max 3 characters from the same category in a pod (friends.ts:1825)
- **dashboard UI**: dropdown (7 options)
- **user-facing vs admin**: admin-only.

### 2.12 systemPrompt

- **type**: string
- **file:line**: `src/lib/friends.ts` (per character)
- **effect**: the core personality prompt fed to the model. defines the character's voice, texting style, few-shot examples, and behavioral rules. this is the single most impactful lever for character personality.
- **dashboard UI**: textarea (admin character editor)
- **user-facing vs admin**: admin-only. this is the "soul" of the character.

---

## 3. pod/group controls

levers that affect group composition — which agents appear together.

### 3.1 pod size

- **current value**: `7` (default parameter in `selectPod`)
- **range**: 3-15 (practical range 4-10)
- **file:line**: `src/lib/friends.ts:1807`
- **effect**: how many agents are in each conversation. 7 gives a lively group chat feel. reducing to 4-5 creates more intimate conversations. above 10 gets chaotic and expensive (more API calls).
- **dashboard UI**: slider (3-12) labeled "group size"
- **user-facing vs admin**: could be user-facing. "small group" vs "big party".

### 3.2 category cap (max per category)

- **current value**: `3` per category
- **range**: 1-7
- **file:line**: `src/lib/friends.ts:1825`
- **effect**: prevents the pod from being all emotional characters or all analytical characters. at 3, a 7-person pod must have at least 3 different categories represented. lowering to 2 forces more diversity. raising to 5+ effectively removes the constraint.
- **dashboard UI**: slider labeled "personality diversity"
- **user-facing vs admin**: admin-only.

### 3.3 core characters boost

- **current value**: `+5` score for core characters
- **core characters**: priya, divya, meera, arjun, tanmay, noor, pradeep, suresh, lalitha, farhan, sneha, dev, shekhar
- **file:line**: `src/lib/friends.ts:1802-1810`
- **effect**: these 13 characters are strongly preferred for pod inclusion. they'll almost always appear unless completely tag-mismatched. removing the boost or reducing it to +2 would create more character variety across conversations.
- **dashboard UI**: multi-select list of "featured characters" + boost slider
- **user-facing vs admin**: admin-only. or possibly user-facing as "favorite characters".

### 3.4 tag-based matching score

- **current value**: `+1` per matching tag
- **file:line**: `src/lib/friends.ts:1810`
- **effect**: characters whose tags match the conversation topic get a higher pod selection score. combined with the core boost (+5), this means a core character with 2 matching tags (score 7) will always beat a non-core character with 3 matching tags (score 3).
- **dashboard UI**: slider for tag weight (0-5)
- **user-facing vs admin**: admin-only.

---

## 4. response quality controls

levers that affect individual response quality, length, and filtering.

### 4.1 maxTokens per length bucket

- **current values**:
  - micro: 60 tokens
  - short: 100 tokens
  - medium: 120 tokens
  - long: 200 tokens
  - rant: 300 tokens
- **file:line**: `src/lib/orchestrator.ts:691-699`
- **effect**: hard cap on model output length per response. these are then further clamped by the character's verbosityRange. too low = truncated responses. too high = wasted tokens and longer responses than intended.
- **dashboard UI**: number inputs per bucket (advanced)
- **user-facing vs admin**: admin-only.

### 4.2 LENGTH_WEIGHTS distribution

- **current values**:
  - micro: 25
  - short: 40
  - medium: 25
  - long: 8
  - rant: 2
- **file:line**: `src/lib/friends.ts:1698-1704`
- **effect**: base probability of each response length. short (40) is most common — most messages are quick takes. rant (2) is rare. these weights are modified by the character's defaultLength (3x boost), mode (shorter/longer modifier), and topic affinity. changing these shifts the overall conversation density.
- **dashboard UI**: 5 sliders or a stacked bar chart editor
- **user-facing vs admin**: admin-only.

### 4.3 conversation modes

- **current modes**: 17 modes (late-night, hot-take, deep-dive, devils-advocate, emotional-support, roast, conspiracy, existential, hype, passive-aggressive, drunk-uncle, corporate, motivational, dark-humor, oversharing, debate-club, silent-breaker)
- **mode activation chance**: 40% (line 1836: `Math.random() < 0.6` returns null)
- **file:line**: `src/lib/friends.ts:1676-1694`
- **effect**: modes overlay a specific behavior on top of the character's base personality. each mode has a length modifier (shorter/same/longer) and a prompt overlay. the 60% null rate means most responses are modeless (natural). modes filtered by agreementBias — contrarians can't be "hype", agreeable agents can't "roast".
- **dashboard UI**: toggle per mode (enable/disable) + activation probability slider
- **user-facing vs admin**: could be user-facing. "enable roast mode", "disable hype mode".

### 4.4 anti-AI blocklist words

- **current blocklist**: "Absolutely", "That's a great question", "I'd be happy to", "It's important to note", "delve", "I couldn't agree more", "Certainly", "Indeed", "Furthermore", "I think there's something to be said for", "an endless cycle", "unsustainable", "low-cost high-reward", "it's worth noting"
- **file:line**: `src/lib/orchestrator.ts:535`
- **effect**: prompt instruction telling the model to never use these phrases. prevents the uncanny-valley "sounds like ChatGPT" problem. adding more words tightens the filter. removing them allows more formal language to slip through.
- **dashboard UI**: editable tag list
- **user-facing vs admin**: admin-only.

### 4.5 garbage detection thresholds

- **current rules** (the `looksIncomplete` function):
  - text length < 3: garbage
  - ends with apostrophe: truncated contraction
  - length <= 6 without proper ending character: garbage
  - multi-word without proper ending: garbage
  - exact duplicate of existing message: garbage
- **file:line**: `src/lib/orchestrator.ts:721-729`
- **effect**: catches truncated or broken model outputs. triggers a retry with a "COMPLETE sentence" instruction. if retry also fails, the agent is skipped entirely.
- **dashboard UI**: toggle for strict/lenient + custom rules
- **user-facing vs admin**: admin-only.

### 4.6 retry behavior on garbage

- **current behavior**: one retry with boosted maxTokens (`Math.max(maxTokens, 150)`) and an explicit "COMPLETE sentence" instruction
- **file:line**: `src/lib/orchestrator.ts:732-739`
- **effect**: gives the model a second chance. if still garbage, agent is silently dropped. more retries = more robust but slower and more expensive.
- **dashboard UI**: number input for max retries
- **user-facing vs admin**: admin-only.

### 4.7 few-shot examples

- **current behavior**: dynamic few-shot examples matched to the chosen response length
- **file:line**: `src/lib/orchestrator.ts:506-525`
- **effect**: shows the model what the target length/style looks like. micro gets "lol", "nah", "valid". long gets multi-sentence examples. these shape the model's output calibration significantly. better examples = more natural responses.
- **dashboard UI**: textarea per length bucket (advanced character editor)
- **user-facing vs admin**: admin-only.

### 4.8 safety settings

- **current value**: all harm categories set to `BLOCK_NONE`
- **file:line**: `src/lib/orchestrator.ts:128-133`
- **effect**: gemini safety filters are fully disabled. this allows characters to be edgy, use profanity, discuss sensitive topics. tightening these would sanitize responses but break character authenticity.
- **dashboard UI**: dropdowns per category (BLOCK_NONE / BLOCK_FEW / BLOCK_SOME / BLOCK_MOST)
- **user-facing vs admin**: admin-only. legal/compliance consideration.

---

## 5. interaction pattern controls

levers that affect how agents interact with each other and the user.

### 5.1 user engagement threshold

- **current behavior**: after 3+ agent messages with no user engagement, the next agent gets a "ask the user a follow-up question" instruction
- **file:line**: `src/lib/orchestrator.ts:896`, used at line 905
- **effect**: prevents the conversation from becoming agents talking to each other while the user watches. the threshold of 3 means the group always gets a few exchanges before pulling the user back in. lowering to 1-2 would make conversations feel more user-focused.
- **dashboard UI**: slider (1-10) labeled "how often should agents engage you?"
- **user-facing vs admin**: could be user-facing.

### 5.2 same-agent-twice-in-a-row blocking

- **current behavior**: hard block — agent can never respond immediately after itself
- **file:line**: `src/lib/orchestrator.ts:428-430`
- **effect**: prevents monologuing. without this, a high-scoring agent could dominate the conversation.
- **dashboard UI**: toggle
- **user-facing vs admin**: admin-only.

### 5.3 hard cap per agent per round

- **current value**: 2 responses maximum per agent per round
- **file:line**: `src/lib/orchestrator.ts:433-434`
- **effect**: no character can send more than 2 messages in a single conversation round. prevents any single agent from dominating. raising to 3 allows more back-and-forth from engaged characters.
- **dashboard UI**: slider (1-5) per agent or global
- **user-facing vs admin**: admin-only.

### 5.4 dropout probability escalation

- **current behavior**: base dropout = `0.08 + lurkerChance * 0.5`. escalates:
  - 5+ messages: 1.5x
  - 6+ messages: 2.5x
  - 8+ messages: 0.9 (90% dropout — conversation almost certainly stops)
- **file:line**: `src/lib/orchestrator.ts:437-448`
- **effect**: this is the main "natural ending" mechanic. after 5 messages, it becomes increasingly hard for more agents to respond. the 8-message cliff is very steep. adjusting these thresholds changes how many messages a typical conversation produces.
- **dashboard UI**: curve editor or preset options ("quick chat" / "normal" / "deep discussion")
- **user-facing vs admin**: could be user-facing as a conversation length preference.

### 5.5 new voice boost

- **current behavior**: if fewer than 5 unique speakers, agents who haven't spoken yet get their delay multiplied by 0.3 (jump ahead in queue)
- **file:line**: `src/lib/orchestrator.ts:870-876`
- **effect**: ensures diversity — new characters enter the conversation before existing ones respond again. the threshold of 5 means this boost is active for most of a 7-person pod. lowering to 3 would allow repeat speakers earlier.
- **dashboard UI**: slider for unique speaker target (2-10)
- **user-facing vs admin**: admin-only.

### 5.6 batch size (parallel responses)

- **current behavior**: 1-2 agents respond per iteration. batch size is 2 only if the top two candidates have delays within 3000ms of each other.
- **file:line**: `src/lib/orchestrator.ts:883-887`
- **effect**: simulates "two people typing at the same time". the 3000ms threshold determines how often this happens. lowering it makes simultaneous responses rarer. raising it makes the chat feel more chaotic.
- **dashboard UI**: slider for simultaneity threshold (1000-10000ms)
- **user-facing vs admin**: admin-only.

### 5.7 duplicate detection

- **current thresholds**:
  - exact match: blocked
  - substring match (first 20 chars): blocked if both messages > 15 chars
  - word overlap > 60%: blocked if >= 3 words
- **file:line**: `src/lib/orchestrator.ts:937-952`
- **effect**: prevents agents from saying the same thing. the 60% word overlap threshold is the key lever — lowering to 40% would be more aggressive (more deduplication), raising to 80% would allow near-paraphrases through.
- **dashboard UI**: slider labeled "response uniqueness" (40-90%)
- **user-facing vs admin**: admin-only.

### 5.8 reply scoring weights

current scoring system for deciding which message an agent replies to:

| signal | score | file:line |
|--------|-------|-----------|
| directly addresses agent by name | +3 | orchestrator.ts:357-359 |
| contains "?" and "you" | +2 | orchestrator.ts:362-364 |
| contrarian bias bonus | +round(abs(bias) * 2) | orchestrator.ts:367-370 |
| message is from user | +1 | orchestrator.ts:373-375 |
| message is in last 2 | +1 | orchestrator.ts:378-380 |
| reply penalty (agent messages) | -replies | orchestrator.ts:388 |
| reply penalty (user messages) | -floor(replies * 0.5) | orchestrator.ts:386 |
| agreeable agent piling on | -2 | orchestrator.ts:393-395 |

- **effect**: this scoring system determines the "shape" of conversations. the +3 for name mentions means direct address always wins. the softer penalty for user messages means multiple agents always respond to the user. the contrarian bonus means provocative characters find things to disagree with.
- **dashboard UI**: weight editor table (advanced admin panel)
- **user-facing vs admin**: admin-only. these are the core conversation dynamics.

### 5.9 soft pressure (pending questions)

- **current behavior**: when agents ask questions, `pendingQuestions` increases. this multiplies the time tick:
  - 1 pending question: 2.0x slower time (more time for user to respond)
  - 2+ pending questions: 3.0x slower time
- **reset**: questions decay over simulated time (`simulatedTimeMs > 15000 * pendingQuestions`)
- **file:line**: `src/lib/orchestrator.ts:814-815`, `orchestrator.ts:1002-1004`
- **effect**: creates a natural pause when agents ask the user something. the conversation slows down to "wait for you". currently cosmetic since the engine runs to completion, but would matter in a real-time streaming implementation.
- **dashboard UI**: toggle + multiplier slider
- **user-facing vs admin**: admin-only.

### 5.10 agent presence lifecycle

agents go through states: offline -> active/lurking -> fading -> offline

| transition | condition | file:line |
|-----------|-----------|-----------|
| offline -> active | simulated time >= arrival time, random > lurkerChance | orchestrator.ts:299-302 |
| offline -> lurking | simulated time >= arrival time, random < lurkerChance | orchestrator.ts:302 |
| active -> fading | responseCount >= fadeAfter AND energy < 0.4 | orchestrator.ts:308 |
| fading -> offline | energy < 0.3 OR random < 0.3 | orchestrator.ts:320 |
| lurking -> active | triggered by scoring (direct address) | orchestrator.ts:964-967 |

- **fadeAfter**: random 2 or 3 (line 287)
- **arrival stagger**: `baseDelay * (0.3 + random * 0.7)` (line 279)
- **effect**: creates a realistic "people joining and leaving" feel. some characters arrive late, some leave early. lurkers get drawn out when directly addressed.
- **dashboard UI**: timeline visualization + per-agent arrival delay slider
- **user-facing vs admin**: admin-only.

### 5.11 "already said" deduplication prompt

- **current behavior**: the prompt includes what other agents already said (first 60 chars each) with an instruction to not repeat them. also includes the agent's own previous messages with a stronger "do NOT repeat" instruction.
- **file:line**: `src/lib/orchestrator.ts:628-645`
- **effect**: prompt-level deduplication. prevents agents from paraphrasing each other. the 60-char truncation keeps the prompt size manageable. longer snippets would give better dedup but cost more tokens.
- **dashboard UI**: slider for snippet length (30-120 chars)
- **user-facing vs admin**: admin-only.

### 5.12 context analysis (missing perspective detection)

- **current behavior**: non-impulsive agents get an extra API call to identify "what angle hasn't been raised yet" before responding
- **max tokens**: 20
- **file:line**: `src/lib/orchestrator.ts:654-667`
- **effect**: helps agents add genuinely new perspectives rather than piling on. adds latency and cost (extra API call per non-impulsive agent). disabling it would make responses faster but more repetitive.
- **dashboard UI**: toggle + model selector for analysis
- **user-facing vs admin**: admin-only.

---

## 6. future levers (not yet implemented)

suggested additions that would enrich the conversation engine.

### 6.1 per-user memory/context

- **what**: store facts from previous conversations (user's job, relationship status, preferences) and inject them into agent prompts
- **effect**: characters would "remember" past conversations. "wait didn't you say last week you were thinking of quitting?"
- **UI**: memory viewer/editor, toggle for "remember me"
- **scope**: user-facing

### 6.2 agent mood/emotional state

- **what**: a per-agent mood variable (0-1 scale across dimensions: happy, frustrated, bored, excited) that shifts based on conversation content and modulates prompt tone
- **effect**: characters would have "good days" and "bad days". a frustrated agent might snap more easily. an excited agent might be more verbose.
- **UI**: mood indicator per character, admin override slider
- **scope**: system-level (auto-computed), admin override

### 6.3 time-of-day behavior changes

- **what**: modify agent behavior based on real-world time. late night = more vulnerable/philosophical. morning = more energetic. work hours = more distracted/brief.
- **effect**: conversations at 2am would feel different from conversations at 2pm.
- **UI**: time-behavior mapping editor (admin)
- **scope**: automatic, admin-configurable

### 6.4 topic banning/forcing

- **what**: allow users to set banned topics (e.g., "don't talk about politics") or force a topic direction
- **effect**: agents would avoid certain subjects or steer toward others.
- **UI**: topic blocklist (user-facing), topic forcelist (admin)
- **scope**: user-facing (bans), admin (forcing)

### 6.5 relationship graph between agents

- **what**: define how agents feel about each other (allies, rivals, crushes, frenemies) and use this to modulate reply targeting and tone
- **effect**: agents would preferentially respond to friends and antagonize rivals. creates richer group dynamics.
- **UI**: relationship matrix editor (admin)
- **scope**: admin-only

### 6.6 user personality profiling

- **what**: after a few conversations, build a profile of the user's communication style and adjust agent behavior accordingly. if the user is terse, agents match energy. if the user is verbose, agents engage more deeply.
- **effect**: the group "adapts" to the user's style over time.
- **UI**: profile viewer, manual overrides
- **scope**: automatic, user-visible

### 6.7 conversation starter templates

- **what**: allow admins to define structured conversation openers beyond the current 8 starters, with specific pod compositions and mode overrides per template
- **effect**: curated conversation experiences. "career advice mode" always picks the right 5 characters.
- **UI**: template builder with character picker + mode selector
- **scope**: admin creates, user selects

### 6.8 real-time user interruption handling

- **what**: allow the user to send follow-up messages mid-conversation that redirect the agents in real-time, with topic change detection and energy injection
- **effect**: more dynamic conversations where the user can steer rather than just start.
- **UI**: chat input enabled during agent responses
- **scope**: user-facing

### 6.9 agent "expertise level" per topic

- **what**: beyond binary tags, give each agent a 0-1 expertise score per topic. high expertise = more detailed, confident responses on that topic. low = vague, deferring.
- **effect**: characters would feel more differentiated on specific topics. a finance person would be authoritative about money but wishy-washy about relationships.
- **UI**: expertise matrix (agent x topic)
- **scope**: admin-only

### 6.10 conversation arc templates

- **what**: predefined conversation shapes (debate -> consensus -> action, exploration -> tangent -> refocus -> insight, etc.) that modulate energy curves and agent selection over time
- **effect**: conversations would follow narrative arcs instead of simple energy decay.
- **UI**: arc template selector + custom arc builder
- **scope**: admin creates, possibly user-selectable as "conversation style"
