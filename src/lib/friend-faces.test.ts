import { describe, expect, it } from "vitest";
import { FRIENDS } from "./friends";
import { faceOptions, faceUri, moodFromText, stickerColor, STICKER_COLORS } from "./friend-faces";

describe("friend faces", () => {
  it("gives every friend a stable sticker colour", () => {
    for (const f of FRIENDS) {
      expect(STICKER_COLORS).toContain(stickerColor(f.id));
      expect(stickerColor(f.id)).toBe(stickerColor(f.id));
    }
  });

  it("builds an offline SVG data URI for every friend", () => {
    for (const f of FRIENDS) {
      expect(faceUri(f.id).startsWith("data:image/svg+xml")).toBe(true);
    }
  });

  it("reads a mood from the message", () => {
    expect(moodFromText("bro you burn maggi 💀")).toBe("smileLOL");
    expect(moodFromText("but do you love momos though 🥺")).toBe("lovingGrin1");
    expect(moodFromText("DUDE YES GO FOR IT")).toBe("angryWithFang");
    expect(moodFromText("what's the rent in goa?")).toBe("concerned");
    expect(moodFromText("ok")).toBeNull();
  });
});

describe("face options", () => {
  it("always picks a real hair style and colour", () => {
    for (const f of FRIENDS) {
      const o = faceOptions(f.id, "smile");
      expect(o.head[0]).toBeTruthy();
      expect(o.headContrastColor[0]).toBeTruthy();
      expect(o.skinColor[0]).toBeTruthy();
    }
  });
});

describe("hair by persona", () => {
  it("never gives the women facial hair", () => {
    for (const id of ["kritika", "simran", "noor"]) expect(faceOptions(id, "smile").facialHairProbability).toBe(0);
    expect(faceOptions("tanmay", "smile").facialHairProbability).toBeGreaterThan(0);
  });
});
