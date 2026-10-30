import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyFieldsOf, mediaOf, memegenLine, memegenUrl, MEME_TEMPLATES } from "./chat-media";
import { clearMediaCache, getMedia, lightestAnimation } from "./get-media";
import { extractMemeMarker } from "./orchestrator";

describe("memegenLine", () => {
  it("escapes memegen's reserved characters", () => {
    expect(memegenLine("100% sure?")).toBe("100~p_sure~q");
    expect(memegenLine("50/50 #1_a-b")).toBe("50~s50_~h1__a--b");
    expect(memegenLine("")).toBe("_");
    expect(memegenLine("can't")).toBe("can't");
    expect(memegenLine("maggi 🔥")).toBe("maggi_%F0%9F%94%A5");
  });
});

describe("memegenUrl", () => {
  it("pads missing lines and folds extra ones into the last", () => {
    expect(memegenUrl("https://api.memegen.link/", "drake", ["studying"], 2)).toBe(
      "https://api.memegen.link/images/drake/studying/_.jpg?width=400",
    );
    expect(memegenUrl("https://m.example", "cmm", ["a", "b"], 1)).toBe("https://m.example/images/cmm/a_b.jpg?width=400");
  });
});

describe("mediaOf / legacyFieldsOf", () => {
  it("prefers media, else builds it from the old flat fields", () => {
    const media = { kind: "gif" as const, url: "https://x/a.gif", alt: "a" };
    expect(mediaOf({ media })).toBe(media);
    expect(mediaOf({ mediaType: "meme", mediaUrl: "https://x/m.jpg" })).toEqual({ kind: "sticker", url: "https://x/m.jpg", alt: "sticker" });
    expect(mediaOf({})).toBeNull();
    expect(legacyFieldsOf(media)).toEqual({ mediaType: "gif", mediaUrl: "https://x/a.gif", mediaThumbnailUrl: "https://x/a.gif", mediaAltText: "a" });
  });
  it("template ids are unique", () => {
    expect(new Set(MEME_TEMPLATES.map((t) => t.id)).size).toBe(MEME_TEMPLATES.length);
  });
});

describe("extractMemeMarker", () => {
  it("reads template and caption lines and strips the tag", () => {
    expect(extractMemeMarker("lol [MEME: Drake | 9pm study | 2am maggi] same")).toEqual({
      template: "drake",
      caption: ["9pm study", "2am maggi"],
      remainingText: "lol  same",
    });
    expect(extractMemeMarker("[MEME: rasode]")).toEqual({ template: "rasode", caption: [], remainingText: "" });
    expect(extractMemeMarker("no tag here")).toBeNull();
  });
});

describe("getMedia", () => {
  const env = { ...process.env };
  beforeEach(() => {
    clearMediaCache();
    process.env.MEME_MEDIA_ENABLED = "1";
    process.env.KLIPY_API_KEY = "test-key";
    delete process.env.MEMEGEN_BASE_URL;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("is off unless MEME_MEDIA_ENABLED is set", async () => {
    delete process.env.MEME_MEDIA_ENABLED;
    expect(await getMedia({ template: "drake", caption: "a|b" })).toBeNull();
  });

  it("builds a captioned memegen sticker without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getMedia({ template: "drake", caption: "studying | maggi at 2am?" })).toEqual({
      kind: "sticker",
      url: "https://api.memegen.link/images/drake/studying/maggi_at_2am~q.jpg?width=400",
      alt: "Drake no/yes meme: studying / maggi at 2am?",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses MEMEGEN_BASE_URL for a self-hosted memegen", async () => {
    process.env.MEMEGEN_BASE_URL = "https://memes.machax.xyz";
    const m = await getMedia({ template: "change-my-mind", caption: ["maggi is a meal"] });
    expect(m?.url).toBe("https://memes.machax.xyz/images/cmm/maggi_is_a_meal.jpg?width=400");
  });

  it("finds an Indian GIF template on Klipy, keeps only matching titles, and caches", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          data: [
            { title: "Random Guy Shocked", file: { md: { gif: { url: "https://k/random.gif" } } } },
            { title: "Kokila Ben Rasode Me Kaun Tha", file: { md: { gif: { url: "https://k/rasode.gif" } } } },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const first = await getMedia({ template: "rasode" });
    expect(first).toEqual({ kind: "gif", url: "https://k/rasode.gif", alt: "Kokila Ben Rasode Me Kaun Tha" });
    await getMedia({ template: "rasode" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null for an unknown template and no search", async () => {
    expect(await getMedia({ template: "nope" })).toBeNull();
  });
});

describe("lightestAnimation", () => {
  it("picks the smallest WebP at least 200px wide", () => {
    expect(
      lightestAnimation({
        hd: { gif: { url: "hd.gif", width: 498, size: 3_000_000 }, webp: { url: "hd.webp", width: 498, size: 540_000 } },
        sm: { gif: { url: "sm.gif", width: 220, size: 160_000 }, webp: { url: "sm.webp", width: 220, size: 128_000 } },
        xs: { webp: { url: "xs.webp", width: 90, size: 35_000 } },
      }),
    ).toBe("sm.webp");
    expect(lightestAnimation({ md: { gif: { url: "md.gif" } } })).toBe("md.gif");
  });
});
