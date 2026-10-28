import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_ENTRY_CHARS,
  MAX_HISTORY_TOTAL_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_OVERRIDE_CHARS,
  MAX_POD_SIZE,
  validateChatInput,
} from "./chat-limits";
import { FRIENDS } from "./friends";

const ids = FRIENDS.map((f) => f.id);
const good = { message: "hi", podFriendIds: [ids[0], ids[1]], history: [{ from: "user", text: "yo" }] };

const reasonFor = (body: unknown) => {
  const r = validateChatInput(body);
  return r.ok ? null : r.reason;
};

describe("validateChatInput", () => {
  it("accepts a normal body and passes the fields through", () => {
    const r = validateChatInput({ ...good, characterOverrides: JSON.stringify({ [ids[0]]: { active: true } }) });
    expect(r).toEqual({
      ok: true,
      value: {
        message: "hi",
        podFriendIds: [ids[0], ids[1]],
        history: [{ from: "user", text: "yo" }],
        characterOverrides: JSON.stringify({ [ids[0]]: { active: true } }),
      },
    });
  });

  it("accepts limits exactly at the cap", () => {
    expect(reasonFor({ ...good, message: "x".repeat(MAX_MESSAGE_CHARS) })).toBeNull();
    expect(reasonFor({ ...good, podFriendIds: ids.slice(0, MAX_POD_SIZE) })).toBeNull();
    expect(reasonFor({ ...good, history: [{ from: "user", text: "x".repeat(MAX_HISTORY_ENTRY_CHARS) }] })).toBeNull();
    const perEntry = MAX_HISTORY_TOTAL_CHARS / 20;
    expect(reasonFor({ ...good, history: Array.from({ length: 20 }, () => ({ from: "user", text: "x".repeat(perEntry) })) })).toBeNull();
  });

  it("treats missing history and null or empty overrides as absent", () => {
    const r = validateChatInput({ message: "hi", podFriendIds: [ids[0]], characterOverrides: null });
    expect(r).toEqual({ ok: true, value: { message: "hi", podFriendIds: [ids[0]], history: [] } });
    expect(validateChatInput({ ...good, characterOverrides: "" })).toMatchObject({ ok: true });
  });

  it("keeps only the last history entries and checks only those", () => {
    const old = { from: "user", text: "x".repeat(MAX_HISTORY_ENTRY_CHARS + 1) }; // dropped before checks
    const recent = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => ({ from: ids[0], text: `m${i}` }));
    const r = validateChatInput({ ...good, history: [old, ...recent] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.history).toHaveLength(MAX_HISTORY_ENTRIES);
      expect(r.value.history[0].text).toBe("m0");
      expect(r.value.history.at(-1)!.text).toBe(`m${MAX_HISTORY_ENTRIES - 1}`);
    }
  });

  it("strips extra keys from history entries", () => {
    const r = validateChatInput({ ...good, history: [{ from: "user", text: "yo", junk: "x".repeat(10_000) }] });
    expect(r.ok && r.value.history).toEqual([{ from: "user", text: "yo" }]);
  });

  it("re-serializes overrides so duplicate keys cannot smuggle extra content", () => {
    const raw = `{"${ids[0]}":{"active":true},"${ids[0]}":{"active":false}}`;
    const r = validateChatInput({ ...good, characterOverrides: raw });
    expect(r.ok && r.value.characterOverrides).toBe(JSON.stringify({ [ids[0]]: { active: false } }));
  });

  it.each([
    ["not an object", "hi"],
    ["message missing", { ...good, message: undefined }],
    ["message blank", { ...good, message: "   " }],
    ["message not a string", { ...good, message: 5 }],
    ["message over the cap", { ...good, message: "x".repeat(MAX_MESSAGE_CHARS + 1) }],
    ["pod missing", { ...good, podFriendIds: undefined }],
    ["pod empty", { ...good, podFriendIds: [] }],
    ["pod over the cap", { ...good, podFriendIds: ids.slice(0, MAX_POD_SIZE + 1) }],
    ["unknown friend", { ...good, podFriendIds: [ids[0], "nobody"] }],
    ["prototype key as friend", { ...good, podFriendIds: ["__proto__"] }],
    ["friend id not a string", { ...good, podFriendIds: [7] }],
    ["history not an array", { ...good, history: "lots" }],
    ["history entry not an object", { ...good, history: ["x"] }],
    ["history text not a string", { ...good, history: [{ from: "user", text: 5 }] }],
    ["history from too long", { ...good, history: [{ from: "u".repeat(65), text: "hi" }] }],
    ["history entry over the cap", { ...good, history: [{ from: "user", text: "x".repeat(MAX_HISTORY_ENTRY_CHARS + 1) }] }],
    [
      "history total over the cap",
      { ...good, history: Array.from({ length: 21 }, () => ({ from: "user", text: "x".repeat(MAX_HISTORY_TOTAL_CHARS / 20) })) },
    ],
    ["overrides not a string", { ...good, characterOverrides: { [ids[0]]: {} } }],
    ["overrides not JSON", { ...good, characterOverrides: "{nope" }],
    ["overrides an array", { ...good, characterOverrides: "[1,2]" }],
    ["overrides unknown friend", { ...good, characterOverrides: JSON.stringify({ nobody: {} }) }],
    [
      "override value over the cap",
      { ...good, characterOverrides: JSON.stringify({ [ids[0]]: { tags: ["x".repeat(MAX_OVERRIDE_CHARS)] } }) },
    ],
  ])("rejects %s", (_label, body) => {
    expect(reasonFor(body)).toEqual(expect.any(String));
  });
});
