import { describe, expect, it } from "vitest";
import { CUE_PLANS, resolveCue, mediaMomentInstruction } from "./first-round-cues";
import { FRIENDS_BY_ID, STARTERS } from "./friends";
import { endsOnQuestion } from "./orchestrator";

// MEME_TEMPLATES ids in chat-media.ts on the `stickers` branch (f6318bd).
const TEMPLATE_IDS = new Set([
  "rasode", "utha-le", "paisa-hi-paisa", "mast-plan", "game-bajana", "risk-nahi",
  "drake", "distracted-boyfriend", "this-is-fine", "roll-safe", "change-my-mind", "is-this-a-pigeon",
  "stonks", "why-not-both", "panik-kalm-panik", "always-has-been", "hide-the-pain",
]);

describe("cue plans", () => {
  it("every example chip has a plan, and every plan is a chip", () => {
    expect(new Set(CUE_PLANS.map((p) => p.text))).toEqual(new Set(STARTERS.map((s) => s.text)));
  });

  it("friends, chosen take and sticker templates all exist", () => {
    for (const plan of CUE_PLANS) {
      expect(plan.chosen.length, plan.text).toBeGreaterThanOrEqual(1);
      expect(plan.chosen.length, plan.text).toBeLessThanOrEqual(2);
      expect(new Set(plan.chosen).size, plan.text).toBe(plan.chosen.length);
      for (const id of plan.chosen) expect(plan.takes.some((t) => t.id === id), `${plan.text} ${id}`).toBe(true);
      for (const take of plan.takes) {
        for (const c of take.cast) expect(FRIENDS_BY_ID[c.id], `${plan.text} ${take.id} ${c.id}`).toBeDefined();
        for (const id of take.media.by) expect(FRIENDS_BY_ID[id]).toBeDefined();
        expect(TEMPLATE_IDS.has(take.media.template), take.media.template).toBe(true);
        expect(take.media.kind === "gif").toBe(!take.media.caption);
      }
    }
  });
});

describe("resolveCue", () => {
  const money = CUE_PLANS[0].text;
  const FRIENDS_IDS = Object.keys(FRIENDS_BY_ID);

  it("is null for a typed message", () => {
    expect(resolveCue("the girl i like posted lilies", ["noor", "suresh", "dev"])).toBeNull();
  });

  it("keeps cast order, skips friends not in the pod, caps at 4", () => {
    const r = resolveCue(money, ["lalitha", "pradeep", "suresh", "noor", "arjun", "dev", "sneha"], "A")!;
    expect(r.speakers).toEqual(["noor", "suresh", "pradeep", "lalitha"]);
    expect(r.media.friendId).toBe("noor");
    expect(Object.keys(r.angles)).toEqual(r.speakers);
  });

  it("tops up from the pod to 3 speakers when the cast is mostly missing", () => {
    const r = resolveCue(money, ["noor", "priya", "meera", "divya"], "A")!;
    expect(r.speakers[0]).toBe("noor");
    expect(r.speakers.length).toBe(3);
    expect(r.speakers).toContain(r.media.friendId);
  });

  it("falls back to a chosen take for an unknown take id", () => {
    expect(CUE_PLANS[0].chosen).toContain(resolveCue(money, ["noor", "suresh", "pradeep"], "Z")!.takeId);
  });

  it("rotates between the chosen takes", () => {
    const pod = FRIENDS_IDS;
    for (const plan of CUE_PLANS) {
      const first = resolveCue(plan.text, pod, undefined, () => 0)!.takeId;
      const last = resolveCue(plan.text, pod, undefined, () => 0.999)!.takeId;
      expect(first).toBe(plan.chosen[0]);
      expect(last).toBe(plan.chosen[plan.chosen.length - 1]);
    }
  });

  it("names the template and caption for the sender", () => {
    const line = mediaMomentInstruction(CUE_PLANS[0].takes[0].media);
    expect(line).toContain("stonks");
    expect(line).toContain("sponsoring his goa trip");
  });
});

describe("endsOnQuestion", () => {
  it("needs the message to end on a question", () => {
    expect(endsOnQuestion("what did the last sunday text say?")).toBe(true);
    expect(endsOnQuestion("lol who ended it? 💀")).toBe(true);
    expect(endsOnQuestion("TILL MARRIAGE?? THEN HE'S HELD HOSTAGE")).toBe(false);
    expect(endsOnQuestion("is he a close friend or a we used to be close one")).toBe(false);
  });
});
