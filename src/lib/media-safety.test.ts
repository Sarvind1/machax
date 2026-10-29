import { describe, expect, it } from "vitest";
import { isSafeStickerTitle } from "./media-service";

describe("isSafeStickerTitle", () => {
  it("keeps cartoon, animal and emoji stickers", () => {
    expect(isSafeStickerTitle("Shocked Cat Meme Sticker")).toBe(true);
    expect(isSafeStickerTitle("Angry Emoji Sticker")).toBe(true);
  });
  it("drops real people and anything unlabelled", () => {
    expect(isSafeStickerTitle("Ishowspeed Shocked Speed Sticker")).toBe(false);
    expect(isSafeStickerTitle("Man Blinks in Surprise Meme Reaction")).toBe(false);
    expect(isSafeStickerTitle("Reaction Shocked")).toBe(false);
    expect(isSafeStickerTitle("Cute baby cat")).toBe(false);
  });
});
