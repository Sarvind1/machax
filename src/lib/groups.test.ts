import { describe, expect, it } from "vitest";
import { FRIENDS_BY_ID } from "./friends";
import { GROUPS, GROUPS_BY_KEY, compactCreditLabel, pickGroup, podForGroup } from "./groups";

describe("GROUPS", () => {
  it("has the six exact group names", () => {
    expect(GROUPS.map((g) => g.name)).toEqual([
      "the advice crew",
      "late night talks",
      "the honest friends",
      "family matters",
      "work stuff",
      "money talk",
    ]);
  });

  it("indexes by key", () => {
    expect(GROUPS_BY_KEY.money.tags).toEqual(["money", "what-to-buy"]);
    expect(GROUPS_BY_KEY.work.tags).toEqual(["career"]);
  });
});

describe("pickGroup", () => {
  it.each([
    ["friend owes me 15k. should i ask him for it back?", "money"],
    ["bali trip on 40k savings?", "money"],
    ["boss texts me on sundays", "work"],
    ["should i resign before the hike", "work"],
    ["rishta meeting on sunday", "family"],
    ["my mom reads my messages", "family"],
    ["my ex liked my story at 2am", "late"],
    ["she ghosted me after our date", "late"],
    ["my roommate never cleans", "honest"],
    ["they didn't invite me", "honest"],
    ["should i dye my hair", "advice"],
    ["", "advice"],
  ])("%s -> %s", (text, key) => {
    expect(pickGroup(text)).toBe(key);
  });

  it("puts money first when two rules match", () => {
    expect(pickGroup("my boss owes me 5k")).toBe("money");
  });

  it("does not match words inside other words", () => {
    expect(pickGroup("update on the next thing")).toBe("advice");
    expect(pickGroup("my sexy new haircut")).toBe("advice");
  });
});

describe("podForGroup", () => {
  it("returns real friend ids of the asked size", () => {
    const ids = podForGroup("money", 5);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) expect(FRIENDS_BY_ID[id]).toBeDefined();
  });
});

describe("compactCreditLabel", () => {
  it("reads as 'N left'", () => {
    expect(compactCreditLabel(12)).toBe("12 left");
    expect(compactCreditLabel(0)).toBe("0 left");
    expect(compactCreditLabel(-3)).toBe("0 left");
  });
});
