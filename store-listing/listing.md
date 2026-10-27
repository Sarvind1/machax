# MachaX: Google Play listing

Counts are Python `len()` (Play counts characters the same way). No em or en dashes.

## App title (max 30)

| Title | Chars | Note |
|---|---|---|
| MachaX: AI Friends Group Chat | 29/30 | top pick |
| MachaX: AI Group Chat | 21/30 | current |
| MachaX: AI Decision Maker | 25/30 |  |
| MachaX: AI Friends & Advice | 27/30 |  |
| MachaX: Ask AI Friends | 22/30 |  |

## Short description (max 80)

| Short description | Chars | Note |
|---|---|---|
| Stuck on a decision? 7 AI friends debate it in a group chat. You pick the move. | 79/80 | top pick |
| Stuck on a decision? AI friends debate it in a group chat. You pick the move. | 77/80 | literal: pod size is 3/5/7/9 |
| Your AI group chat. AI friends argue your dilemma so you can finally decide. | 76/80 |  |
| Overthinking? Ask a group of AI friends. They debate, roast and help you decide. | 80/80 |  |

## Full description (3171/4000 chars)

Shown before "more" (first ~167 chars):
> Stuck on a decision? Drop it in your AI group chat. Your AI friends debate it, argue it out, and lay out the options. You pick the move.

MachaX is a group chat with A

Source of truth: `full-description.txt` (paste as is).

```
Stuck on a decision? Drop it in your AI group chat. Your AI friends debate it, argue it out, and lay out the options. You pick the move.

MachaX is a group chat with AI friends, made in Bengaluru. Not one chatbot giving you one polite answer. A whole gang of AI characters with their own opinions, who disagree with each other like real friends do. Machaa, finally a group that replies at 3am.

WHAT YOU CAN ASK
• Job offer, startup or stable job?
• Should I text first after a silent week?
• Move out or keep saving?
• iPhone or finally try Android?
• Friend cancelled plans again. Am I overreacting?
• Everyone is getting married and I am tired.

HOW IT WORKS
1. Type your messiest thought. No structure needed.
2. Your pod of AI friends jumps in. They agree, disagree, roast and reply to each other.
3. Open the drill-down. See every option laid out, and which friends backed each one.
4. Pick one. Your choice is saved in Your Decisions so you can look back later.

MEET THE GANG
100 AI characters, each with a real personality and texting style. A few regulars:
• Arjun, the strategist. If this, then that.
• Farhan, the contrarian. Consensus makes him suspicious.
• Sneha, the uncomfortable truth. Kind, but she will say it.
• Noor, the spreadsheet. Cuts the drama with numbers.
• Suresh, the uncle with answers. Has a story for everything.
• Dev, the chaos gremlin. Deadpan roasts, zero chill.
• Meera, the devotee. Takes your side, HARD.

BUILD YOUR POD
• Choose a pod of 3, 5, 7 or 9 AI friends
• Hand pick who sits in your group chat
• Tune each friend: chatty or quiet, agreeable or contrarian, fast or slow replies, short or long messages
• Turn GIF reactions on or off

SET THE MOOD
Switch the vibe of the chat any time:
• Late night: soft, 2am energy
• Hot takes: spicy and fun
• Deep dive: fully unpacked
• Devil's advocate: real pushback
• Emotional support: mostly listening
• Lovingly roast: tease, gently
• Hype mode: your personal cheerleaders
• Debate club: proper back and forth
Set the pacing (snappy, natural, slow) and energy (low, settled, up) too.

WHY A GROUP CHAT AND NOT ONE AI?
One AI assistant tends to agree with you. A group does not. When seven friends argue about your dilemma, you hear the angles you were avoiding. The argument is the decision help. It is like a council in your head, dimaag ki parliament, except it lives in your pocket.

GOOD FOR
• Overthinkers and late night spiralers
• Career, money, relationship and life decisions
• Venting when you just want to be heard
• Fun hot takes and debates with AI friends
• Anyone who asks five friends and still cannot decide

PLEASE NOTE
• MachaX is for users 18 and above.
• The AI characters are fictional. Their replies are AI generated and can be wrong, so use your own judgement.
• MachaX is for fun and perspective. It is not medical, legal, financial or mental health advice. If you are in crisis, please reach out to a professional or a local helpline.
• You can delete your account from settings at any time.

Got a dilemma sitting in your head? Bring it to the group. Download MachaX, start your first AI group chat and let the gang fight it out. You just pick the move.
```

## Screenshots (upload in this order)

| # | File | Headline |
|---|---|---|
| 1 | screenshots/01-hero.png | 7 AI friends debate your dilemma. You pick the move. |
| 2 | screenshots/02-they-argue.png | They don't just agree with you. |
| 3 | screenshots/03-drill-down.png | See every option. Pick one. |
| 4 | screenshots/04-pick-your-pod.png | Pick your gang. 3, 5, 7 or 9. |
| 5 | screenshots/05-tune-friends.png | Tune every friend. |
| 6 | screenshots/06-set-the-mood.png | Set the mood. |
| 7 | screenshots/07-decisions-saved.png | Every decision, saved. |
| 8 | screenshots/08-ask-anything.png | Ask anything. Even at 3am. |

Feature graphic: `feature-graphic.png` (1024x500).

Screens are faithful HTML mockups of the real UI (colours, fonts, components and characters from `src/app/chat/chat.css`, `src/lib/friends.ts`), not live captures; chat lines are written examples. Rebuild: `python src/render.py` (needs `playwright` + `pillow`).
