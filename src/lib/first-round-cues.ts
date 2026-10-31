// first-round-cues.ts — how the first round of replies goes for each example
// chip (STARTERS in friends.ts). Most guests leave after one or two messages,
// so the first round to a tapped chip is planned: which friends speak and in
// what order, the angle each one takes, the sticker moment, and the question
// that ends the round.
//
// Each cue has a few "takes". `chosen` lists the 1-2 takes that run; with two,
// each new chat picks one at random. Swap them to try another. A friend in a take who isn't in the user's pod is skipped (the pod
// is picked on the phone), and the round tops up from the pod.
//
// Angles are a direction, not a line to copy: the friend still writes in their
// own voice. Write them without he/she for the user ("you", or {user} in a hook,
// which becomes the user's name): how friends refer to the user comes from the
// gender module (gender.ts).
//
// Sticker templates are ids from MEME_TEMPLATES (chat-media.ts). `caption` is
// the text drawn on a memegen template, one entry per
// line; GIF templates (rasode, utha-le, paisa-hi-paisa, mast-plan, ...) take no
// caption, so the friend's own message carries it.

import { FRIENDS_BY_ID } from "./friends";

export interface CueMedia {
  /** Who sends it, in order of preference; the first one speaking this round sends it. */
  by: string[];
  kind: "sticker" | "gif";
  /** MEME_TEMPLATES id. */
  template: string;
  /** memegen caption lines (sticker templates only). */
  caption?: string[];
  /** Cartoon-sticker search if the template can't be found. */
  search: string;
  /** What the sender's text does around the sticker. */
  setup: string;
}

export interface CueTake {
  id: string;
  /** One line for the review doc: what this take is going for. */
  note: string;
  /** Speaking order. Lead first. 3-4 of these speak. */
  cast: { id: string; angle: string }[];
  media: CueMedia;
  /** The closing question to the user; the last speaker asks something like it. */
  hook: string;
}

export interface CuePlan {
  text: string;
  /** True when the cue is a real choice, so the round ends with a vote card. */
  decision: boolean;
  /** Take ids that run (1-2); each first round picks one at random. */
  chosen: string[];
  takes: CueTake[];
}

export const CUE_PLANS: CuePlan[] = [
  {
    text: "My friend owes me 15k and keeps posting Goa stories",
    decision: true,
    chosen: ["C", "B"],
    takes: [
      {
        id: "A",
        note: "roast the Goa flex with rupee math, then a petty-but-real plan",
        cast: [
          { id: "noor", angle: "do the rupee math on what the 15k bought in Goa (shacks, beer buckets, the parasailing video). deadpan, specific" },
          { id: "suresh", angle: "a quick uncle-story: you once lent money to a friend who then went to Goa too, and how you never got it back. own the embarrassment" },
          { id: "pradeep", angle: "the fix: reply to his Goa story itself with a UPI request for ₹15,000. one line, no drama" },
          { id: "lalitha", angle: "deadline energy: a date by which it's paid, and the exact text" },
          { id: "dev", angle: "one-line deadpan roast of the friend's beach photos" },
        ],
        media: { by: ["noor", "dev", "pradeep"], kind: "sticker", template: "stonks", caption: ["lending 15k to a friend", "sponsoring his goa trip"], search: "money flying away", setup: "drop it with 2-5 words like 'your 15k rn' or nothing" },
        hook: "ask how long ago he borrowed it and whether he's even mentioned it since",
      },
      {
        id: "B",
        note: "UPI-QR-on-his-story bit as the hero, Hera Pheri GIF",
        cast: [
          { id: "pradeep", angle: "reply to his Goa story with your UPI QR code. that's the whole plan" },
          { id: "arjun", angle: "strategy: ask in DM first, story reply second, group chat mention third. escalating, cold" },
          { id: "suresh", angle: "warn: wait any longer and it becomes 'bro we're friends why are you counting'" },
          { id: "noor", angle: "15k is X beer buckets at Baga, he has clearly prioritised" },
        ],
        media: { by: ["arjun", "noor", "suresh"], kind: "gif", template: "paisa-hi-paisa", search: "money rain cartoon", setup: "text like 'him in goa with your 15k:'" },
        hook: "ask whether he's the kind who pays when shamed a little or the kind who gets defensive",
      },
      {
        id: "C",
        note: "a split: one says go soft, one says go public, Drake sticker",
        cast: [
          { id: "lalitha", angle: "go soft: one polite text with a date. people forget, give him one shot" },
          { id: "sneha", angle: "disagree with going soft: he's not forgetting, he's posting. he knows" },
          { id: "noor", angle: "the math of what 15k is to you vs to a guy doing Goa" },
          { id: "dev", angle: "deadpan: comment 'nice view, my 15k must be enjoying it'" },
        ],
        media: { by: ["dev", "sneha", "noor"], kind: "sticker", template: "drake", caption: ["asking nicely for the 15k", "commenting 'nice view' on every goa story"], search: "side eye cartoon", setup: "no text or a 2-word lead-in" },
        hook: "ask if this friend is a close one or a 'we used to be close' one",
      },
    ],
  },
  {
    text: "Mom set up a rishta meeting this Sunday. Do I go?",
    decision: true,
    chosen: ["C", "B"],
    takes: [
      {
        id: "A",
        note: "go-for-the-samosas chaos vs the uncomfortable truth, Drake sticker",
        cast: [
          { id: "meera", angle: "loud: GO, free samosas and you get to judge the aunty's sofa covers. all caps energy" },
          { id: "sneha", angle: "going is not saying yes. one chai is not a wedding" },
          { id: "shekhar", angle: "interrogate: is the other person also being dragged by their mom? probably yes" },
          { id: "tanmay", angle: "spiral: what if they're actually cool and now you have to tell mom she was right" },
          { id: "divya", angle: "read the real fear: it's not the meeting, it's mom winning" },
        ],
        media: { by: ["meera", "shekhar", "sneha"], kind: "sticker", template: "drake", caption: ["fighting mom for 3 weeks", "1 hour of chai and free samosas"], search: "cat drinking tea", setup: "a 2-5 word lead-in or nothing" },
        hook: "ask whether they've seen the person's photo yet, and what the vibe was",
      },
      {
        id: "B",
        note: "panik-kalm-panik arc, ends on the mom-already-told-everyone twist",
        cast: [
          { id: "tanmay", angle: "overthinking the whole Sunday minute by minute, funny" },
          { id: "sneha", angle: "flat: go, be honest, leave. it's one afternoon" },
          { id: "meera", angle: "plan the escape: a friend calls at the 40 minute mark" },
          { id: "shekhar", angle: "ask the uncomfortable thing: is there someone else you'd rather be seeing" },
        ],
        media: { by: ["tanmay", "meera"], kind: "sticker", template: "panik-kalm-panik", caption: ["mom set up a rishta", "it's just one chai", "mom already told masi"], search: "nervous cartoon", setup: "no text or 'sunday be like'" },
        hook: "ask if mom has already told the relatives",
      },
      {
        id: "C",
        note: "the fake-call exit plan, Hera Pheri 'mast plan' GIF",
        cast: [
          { id: "meera", angle: "the exit plan: a friend calls at 7:40 with a 'flat flooding' emergency" },
          { id: "divya", angle: "go, but go as yourself, not as mom's résumé of you" },
          { id: "priya", angle: "one specific, fresh story of a rishta chai that went weird (a detail like the uncle's cricket opinions). not 'i did this once'" },
          { id: "sneha", angle: "push back on the fake call: just say no thanks after, you're an adult" },
        ],
        media: { by: ["divya", "priya", "sneha"], kind: "gif", template: "mast-plan", search: "thumbs up cartoon", setup: "react to Meera's exit plan, e.g. 'meera's plan:'" },
        hook: "ask what they'd say if mom asks 'so? did you like?' on Sunday night",
      },
    ],
  },
  {
    text: "Boss texts me on Sunday nights. Reply or ignore?",
    decision: true,
    chosen: ["B", "A"],
    takes: [
      {
        id: "A",
        note: "Monday-9am 'noted 👍' bit, unpaid-hours math, This-is-fine sticker",
        cast: [
          { id: "farhan", angle: "contrarian: reply, but at 9:01am Monday with 'noted 👍'. a power move" },
          { id: "noor", angle: "the math: Sunday replies are unpaid overtime, a little pay cut every week" },
          { id: "suresh", angle: "story: you replied every Sunday for 2 years, the promotion went to the guy who didn't" },
          { id: "shekhar", angle: "ask what the texts actually say: 'quick one' at 10:47pm is never quick" },
          { id: "pradeep", angle: "the fix: phone on DND after 9, reply Monday, done" },
        ],
        media: { by: ["noor", "farhan", "pradeep"], kind: "sticker", template: "this-is-fine", caption: ["sunday 10:47pm", "'hey quick one' from boss"], search: "dog in fire cartoon", setup: "nothing, or 'every sunday:'" },
        hook: "ask what the last Sunday text actually said",
      },
      {
        id: "B",
        note: "DND loophole, Roll-safe sticker",
        cast: [
          { id: "pradeep", angle: "DND 9pm to 9am. reply Monday morning. done" },
          { id: "tanmay", angle: "overthink: if you reply once, Sunday becomes a workday forever" },
          { id: "lalitha", angle: "a rule: urgent = he calls. a text can wait till Monday" },
          { id: "farhan", angle: "hot take: reply instantly, then ask for comp-off. watch him stop" },
        ],
        media: { by: ["pradeep", "farhan"], kind: "sticker", template: "roll-safe", caption: ["can't miss boss's sunday text", "if your phone is on DND till monday"], search: "smart thinking cartoon", setup: "nothing or 'big brain move'" },
        hook: "ask if the boss ever actually needs an answer before Monday",
      },
      {
        id: "C",
        note: "fed-up Baburao GIF, Suresh story",
        cast: [
          { id: "suresh", angle: "story: your old boss sent 'call me' on a Sunday. it was about a PPT font" },
          { id: "noor", angle: "count it: 4 Sundays x 1 hour = a free work day a month" },
          { id: "shekhar", angle: "does he text everyone or just you? that matters" },
          { id: "arjun", angle: "play: never reply on Sunday, over-deliver Monday. he learns" },
        ],
        media: { by: ["noor", "shekhar", "arjun"], kind: "gif", template: "utha-le", search: "tired cartoon", setup: "text like 'me opening slack at 11pm sunday:'" },
        hook: "ask if he texts everyone on the team or only them",
      },
    ],
  },
  {
    text: "My ex liked my story at 2am. Should I reply?",
    decision: true,
    chosen: ["C", "B"],
    takes: [
      {
        id: "A",
        note: "which-story detective work, panik-kalm-panik sticker",
        cast: [
          { id: "meera", angle: "loud: WHICH STORY. if it was a thirst trap that's a different case" },
          { id: "sneha", angle: "flat no: a 2am like is boredom, not a sign" },
          { id: "shekhar", angle: "interrogate: was the story new or from 3 days ago? old story = they went looking" },
          { id: "divya", angle: "the real read: you don't want to reply, you want them to miss you" },
          { id: "tanmay", angle: "spiral on what 2am means (insomnia? drunk? new partner asleep next to them?)" },
        ],
        media: { by: ["shekhar", "meera", "divya"], kind: "sticker", template: "panik-kalm-panik", caption: ["ex liked your story", "it's 2am, they're just bored", "the story was from 3 days ago"], search: "shocked cartoon", setup: "nothing or 'the timeline:'" },
        hook: "ask what the story was",
      },
      {
        id: "B",
        note: "is-this-closure pigeon sticker, Sneha vs Meera",
        cast: [
          { id: "sneha", angle: "no. you broke up for a reason. a like is not an apology" },
          { id: "meera", angle: "disagree with Sneha loudly: reply with a single emoji, chaos is fun" },
          { id: "divya", angle: "you're asking because you hoped for this" },
          { id: "shekhar", angle: "who ended it? that decides who the 2am like is for" },
        ],
        media: { by: ["divya", "shekhar", "meera"], kind: "sticker", template: "is-this-a-pigeon", caption: ["you", "a 2am story like", "is this closure?"], search: "confused cartoon", setup: "nothing" },
        hook: "ask who ended it",
      },
      {
        id: "C",
        note: "'Rasode mein kaun tha' GIF: who's up at 2am",
        cast: [
          { id: "meera", angle: "who's up at 2am liking stories. caught" },
          { id: "tanmay", angle: "overthinking the timing of the like, minute by minute" },
          { id: "sneha", angle: "don't reply. don't screenshot it to us either. ok fine screenshot it" },
          { id: "divya", angle: "you already replied in your head, didn't you" },
        ],
        media: { by: ["meera", "tanmay"], kind: "gif", template: "rasode", search: "detective cartoon", setup: "text like 'who's awake at 2am liking stories:'" },
        hook: "ask how long it's been since the breakup",
      },
    ],
  },
  {
    text: "Got a 30% hike offer but the new team seems toxic",
    decision: true,
    chosen: ["A", "C"],
    takes: [
      {
        id: "A",
        note: "hike-minus-therapy math, Distracted-boyfriend sticker",
        cast: [
          { id: "noor", angle: "the math: 30% hike minus therapy, Swiggy stress orders and the cab you'll take to cry. what's left" },
          { id: "farhan", angle: "contrarian: every team is toxic, at least this one pays 30% more for it" },
          { id: "suresh", angle: "story: took a toxic team for the money once, quit in 5 months, the money went on the notice period" },
          { id: "shekhar", angle: "toxic how? one rude interviewer or Glassdoor horror stories?" },
          { id: "tanmay", angle: "overthink: what does 'seems' toxic even mean" },
        ],
        media: { by: ["farhan", "noor", "shekhar"], kind: "sticker", template: "distracted-boyfriend", caption: ["30% hike", "you", "your mental peace"], search: "money vs sleep cartoon", setup: "nothing" },
        hook: "ask what exactly made the team seem toxic",
      },
      {
        id: "B",
        note: "This-is-fine sticker for the toxic standup",
        cast: [
          { id: "farhan", angle: "take it and treat it as a 1-year paid internship in tolerating people" },
          { id: "arjun", angle: "strategy: take it if the manager is fine. the team you can survive, a bad manager you can't" },
          { id: "lalitha", angle: "ask for a call with someone on the team before signing" },
          { id: "noor", angle: "30% on what base? 30% of 6L is not 30% of 20L" },
        ],
        media: { by: ["noor", "arjun", "farhan"], kind: "sticker", template: "this-is-fine", caption: ["toxic team standup", "me with a 30% hike"], search: "dog in fire cartoon", setup: "nothing or 'you in month 3:'" },
        hook: "ask whether the toxic part is the manager or the team",
      },
      {
        id: "C",
        note: "Hera Pheri 'paisa hi paisa' GIF vs Suresh warning",
        cast: [
          { id: "farhan", angle: "money talks. toxic people are everywhere, 30% isn't" },
          { id: "suresh", angle: "warning story with a specific detail" },
          { id: "shekhar", angle: "did you actually meet them, or is it vibes from one interview" },
          { id: "pradeep", angle: "fix: negotiate a joining bonus to cover a quick exit" },
        ],
        media: { by: ["farhan", "pradeep"], kind: "gif", template: "paisa-hi-paisa", search: "money rain cartoon", setup: "text like 'you seeing the offer letter:'" },
        hook: "ask what the current job is like, honestly",
      },
    ],
  },
  {
    text: "Friends want a Bali trip. I have 40k in savings",
    decision: true,
    chosen: ["C", "B"],
    takes: [
      {
        id: "A",
        note: "flight math kills it, Gokarna counter-offer, Drake sticker",
        cast: [
          { id: "noor", angle: "math: flights alone eat most of it. what's left per day in Bali" },
          { id: "suresh", angle: "story: the Goa trip you still can't talk about, and the credit card bill after" },
          { id: "pradeep", angle: "counter-offer: Gokarna or Pondy with the same gang, 12k all in" },
          { id: "lalitha", angle: "if Bali is happening, here's the cap and what to cut" },
          { id: "dev", angle: "deadpan: bali on 40k is just a nice airport visit" },
        ],
        media: { by: ["pradeep", "dev", "noor"], kind: "sticker", template: "drake", caption: ["bali on all 40k savings", "gokarna with 25k left over"], search: "beach cartoon", setup: "nothing" },
        hook: "ask whether anyone in the gang has actually booked anything yet",
      },
      {
        id: "B",
        note: "panik-kalm-panik budget arc",
        cast: [
          { id: "lalitha", angle: "organizer: dates, cap, who books what" },
          { id: "noor", angle: "the exact flight number dread: ~₹28-35k return from India" },
          { id: "suresh", angle: "keep an emergency fund. you will need it the week you get back" },
          { id: "arjun", angle: "go only if the 40k gets topped up before the trip. plan for it" },
        ],
        media: { by: ["noor", "lalitha"], kind: "sticker", template: "panik-kalm-panik", caption: ["friends planning bali", "you have 40k", "flights are 32k"], search: "nervous cartoon", setup: "nothing" },
        hook: "ask when the trip is, and how much they can add by then",
      },
      {
        id: "C",
        note: "'Bilkul risk nahi lene ka' GIF, cautious crew",
        cast: [
          { id: "suresh", angle: "don't empty savings for a trip, from experience" },
          { id: "dev", angle: "deadpan roast of Bali Instagram plans" },
          { id: "pradeep", angle: "go, but only with 10k untouched" },
          { id: "noor", angle: "per-day spend math" },
        ],
        media: { by: ["suresh", "noor"], kind: "gif", template: "risk-nahi", search: "careful cartoon", setup: "text like 'your savings account rn:'" },
        hook: "ask if 40k is all their savings or just the fun money",
      },
    ],
  },
  {
    text: "She left me on seen for 2 days. Do I double text?",
    decision: true,
    chosen: ["A"],
    takes: [
      {
        id: "A",
        note: "Tanmay spiral vs Sneha flat no, panik-kalm-panik sticker",
        cast: [
          { id: "tanmay", angle: "spiral: hour-by-hour theories of why she hasn't replied" },
          { id: "sneha", angle: "flat: 2 days on seen is an answer. you're just proofreading it" },
          { id: "dev", angle: "one deadpan line, e.g. that she's clearly busy viewing everyone else's stories" },
          { id: "meera", angle: "the opposite: DOUBLE TEXT, but make it funny, a meme, not 'hey??'" },
          { id: "divya", angle: "what did your last message say? that's the real clue" },
        ],
        media: { by: ["tanmay", "dev", "meera"], kind: "sticker", template: "panik-kalm-panik", caption: ["left on seen", "she's probably busy", "she posted a story 3 hours ago"], search: "anxious cartoon", setup: "nothing" },
        hook: "ask what their last message to her was",
      },
      {
        id: "B",
        note: "Hide-the-pain sticker for 'no worries if you're busy!'",
        cast: [
          { id: "sneha", angle: "don't. if she wanted to, she would" },
          { id: "meera", angle: "send one, but funny. never 'hey??'" },
          { id: "priya", angle: "a fresh specific story about a reply that came back after 3 days with a reel. not 'i did this once'" },
          { id: "shekhar", angle: "did the convo die on your message or hers?" },
        ],
        media: { by: ["meera", "priya", "shekhar"], kind: "sticker", template: "hide-the-pain", caption: ["'no worries if you're busy!!'", "day 3 on seen"], search: "awkward smile cartoon", setup: "nothing" },
        hook: "ask whether the last message was a question or a statement",
      },
      {
        id: "C",
        note: "Baburao 'utha le' GIF, fed-up energy",
        cast: [
          { id: "dev", angle: "deadpan, one line" },
          { id: "tanmay", angle: "overthinking the blue ticks" },
          { id: "sneha", angle: "the truth, kindly" },
          { id: "pradeep", angle: "fix: one light text, then drop it forever" },
        ],
        media: { by: ["tanmay", "dev"], kind: "gif", template: "utha-le", search: "sad cartoon", setup: "text like 'you refreshing whatsapp:'" },
        hook: "ask how long they've been talking",
      },
    ],
  },
  {
    text: "Parents want me home by 10pm. I'm 24",
    decision: true,
    chosen: ["B"],
    takes: [
      {
        id: "A",
        note: "Cinderella deadpan + 'always has been' sticker",
        cast: [
          { id: "dev", angle: "deadpan: even Cinderella got till 12" },
          { id: "meera", angle: "loud outrage, all caps: you're 24 with a salary" },
          { id: "suresh", angle: "story: lived at home till 29, the curfew ended the day you paid rent" },
          { id: "pradeep", angle: "fix: negotiate 11:30 and send live location, parents love live location" },
          { id: "lalitha", angle: "practical: what are they actually scared of? fix that, not the time" },
        ],
        media: { by: ["suresh", "dev", "pradeep"], kind: "sticker", template: "always-has-been", caption: ["wait, the curfew lasts till marriage?", "always has been"], search: "clock cartoon", setup: "nothing" },
        hook: "ask what happens if {user} comes home at 10:30",
      },
      {
        id: "B",
        note: "live-location loophole, Roll-safe sticker",
        cast: [
          { id: "pradeep", angle: "live location on, home by 11:30. deal" },
          { id: "dev", angle: "deadpan roast" },
          { id: "tanmay", angle: "it's not about 10pm, it's about your parents not seeing you as an adult yet" },
          { id: "meera", angle: "chaos: pay rent at home, demand a 1am curfew" },
        ],
        media: { by: ["pradeep", "dev"], kind: "sticker", template: "roll-safe", caption: ["can't break curfew", "if you're home by 10 and leave again at 10:30"], search: "smart cartoon", setup: "nothing" },
        hook: "ask if {user} pays anything at home",
      },
      {
        id: "C",
        note: "'Rasode mein kaun tha' GIF: the 10:15 gate",
        cast: [
          { id: "meera", angle: "loud: 10PM AT 24" },
          { id: "suresh", angle: "story" },
          { id: "dev", angle: "deadpan" },
          { id: "lalitha", angle: "what are they worried about" },
        ],
        media: { by: ["dev", "meera"], kind: "gif", template: "rasode", search: "caught cartoon", setup: "text like 'you opening the gate at 10:07:'" },
        hook: "ask whether {user}'s siblings get the same rule",
      },
    ],
  },
];

export const CUE_PLANS_BY_TEXT: Record<string, CuePlan> = Object.fromEntries(CUE_PLANS.map((p) => [p.text, p]));

/** What the engine needs for one first round, fitted to the user's pod. */
export interface ResolvedCue {
  takeId: string;
  decision: boolean;
  /** Speaking order: 3-4 friends, all in the pod. */
  speakers: string[];
  angles: Record<string, string>;
  /** The sticker, and who sends it (one of `speakers`). */
  media: CueMedia & { friendId: string };
  hook: string;
}

const FIRST_ROUND_SPEAKERS = 4;
const MIN_FIRST_ROUND_SPEAKERS = 3;

/**
 * The plan for a cue chip, fitted to the pod, or null when `message` isn't a
 * chip. The take is a random one of the cue's `chosen`; `takeId` overrides it
 * (for evals). `rand` is injectable for tests.
 */
export function resolveCue(message: string, podFriendIds: string[], takeId?: string, rand: () => number = Math.random): ResolvedCue | null {
  const plan = CUE_PLANS_BY_TEXT[message.trim()];
  if (!plan) return null;
  const picked = plan.chosen[Math.floor(rand() * plan.chosen.length)] ?? plan.chosen[0];
  const take = plan.takes.find((t) => t.id === takeId) ?? plan.takes.find((t) => t.id === picked) ?? plan.takes[0];
  const inPod = new Set(podFriendIds);
  const speakers = take.cast.map((c) => c.id).filter((id) => inPod.has(id)).slice(0, FIRST_ROUND_SPEAKERS);
  // Top up from the pod, chattiest first, so there are always 3+ voices.
  if (speakers.length < MIN_FIRST_ROUND_SPEAKERS) {
    const rest = podFriendIds
      .filter((id) => !speakers.includes(id) && FRIENDS_BY_ID[id])
      .sort((a, b) => (FRIENDS_BY_ID[b].traits.talkativeness ?? 0.5) - (FRIENDS_BY_ID[a].traits.talkativeness ?? 0.5));
    speakers.push(...rest.slice(0, MIN_FIRST_ROUND_SPEAKERS - speakers.length));
  }
  if (speakers.length === 0) return null;
  const angles = Object.fromEntries(take.cast.filter((c) => speakers.includes(c.id)).map((c) => [c.id, c.angle]));
  // The sender: first preferred friend who speaks; else the most sticker-happy speaker.
  const friendId =
    take.media.by.find((id) => speakers.includes(id)) ??
    [...speakers].sort((a, b) => (FRIENDS_BY_ID[b]?.traits.mediaSendProbability ?? 0) - (FRIENDS_BY_ID[a]?.traits.mediaSendProbability ?? 0))[0];
  return { takeId: take.id, decision: plan.decision, speakers, angles, media: { ...take.media, friendId }, hook: take.hook };
}

/** Prompt line for the friend who sends the cue's sticker. */
export function mediaMomentInstruction(media: CueMedia): string {
  const what = media.caption?.length
    ? `the "${media.template}" meme with the caption "${media.caption.join(" / ")}"`
    : `the "${media.template}" GIF`;
  return `Your message goes out with a ${media.kind}: ${what}. The ${media.kind} is the punchline, so don't describe it or repeat its caption. ${media.setup}.`;
}
