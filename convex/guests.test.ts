// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { GUEST_HARD_CAP, GUEST_IP_LIMIT_PER_HOUR, GUEST_TYPED_LIMIT } from "./guestLimits";

const modules = import.meta.glob("./**/*.ts");
const GID = "0123456789abcdef0123";
const KEY = `g:${GID}`;

function setup() {
  return convexTest(schema, modules);
}

// One full guest message: begin, then settle with the given outcome.
async function send(
  t: ReturnType<typeof setup>,
  opts: { key?: string; ip?: string; example?: boolean; delivered?: boolean } = {},
) {
  const key = opts.key ?? KEY;
  const ipHash = opts.ip ?? "ip1";
  const example = opts.example ?? false;
  const ref = crypto.randomUUID();
  const begin = await t.mutation(internal.guests.beginGuestMessage, { key, ipHash, example, ref });
  if (!begin.ok) return { begin, settled: null };
  const settled = await t.mutation(internal.guests.settleGuestMessage, {
    key,
    ipHash,
    windowStart: begin.windowStart,
    ref,
    example,
    delivered: opts.delivered ?? true,
    costMicros: 1000,
  });
  return { begin, settled };
}

describe("guest limits", () => {
  test("3 typed messages, then typed_limit", async () => {
    const t = setup();
    for (let i = 1; i <= GUEST_TYPED_LIMIT; i++) {
      const { begin, settled } = await send(t);
      expect(begin.ok).toBe(true);
      expect(settled?.typedUsed).toBe(i);
    }
    const { begin } = await send(t);
    expect(begin).toMatchObject({ ok: false, reason: "typed_limit", usage: { typedUsed: 3, totalUsed: 3 } });
  });

  test("example prompts don't use typed messages but hit the hard cap", async () => {
    const t = setup();
    for (let i = 0; i < GUEST_TYPED_LIMIT; i++) await send(t);
    // Typed is used up, examples still go through until the hard cap.
    for (let i = GUEST_TYPED_LIMIT; i < GUEST_HARD_CAP; i++) {
      const { begin, settled } = await send(t, { example: true });
      expect(begin.ok).toBe(true);
      expect(settled).toMatchObject({ typedUsed: GUEST_TYPED_LIMIT, totalUsed: i + 1 });
    }
    const { begin } = await send(t, { example: true });
    expect(begin).toMatchObject({ ok: false, reason: "cap" });
  });

  test("a message that got no replies counts nothing and gives the IP slot back", async () => {
    const t = setup();
    const { settled } = await send(t, { delivered: false });
    expect(settled).toMatchObject({ typedUsed: 0, totalUsed: 0 });
    const rows = await t.run((ctx) => ctx.db.query("guestIpRate").collect());
    expect(rows[0].count).toBe(0);
  });

  test("busy while a message is in flight; a repeated settle is a no-op", async () => {
    const t = setup();
    const ref = "r1";
    const begin = await t.mutation(internal.guests.beginGuestMessage, { key: KEY, ipHash: "ip1", example: false, ref });
    expect(begin.ok).toBe(true);
    const again = await t.mutation(internal.guests.beginGuestMessage, { key: KEY, ipHash: "ip1", example: false, ref: "r2" });
    expect(again).toMatchObject({ ok: false, reason: "busy" });
    const args = { key: KEY, ipHash: "ip1", windowStart: begin.ok ? begin.windowStart : 0, ref, example: false, delivered: true, costMicros: 5 };
    expect(await t.mutation(internal.guests.settleGuestMessage, args)).toMatchObject({ typedUsed: 1 });
    expect(await t.mutation(internal.guests.settleGuestMessage, args)).toMatchObject({ typedUsed: 1 });
  });

  test("per-IP limit across different guest ids", async () => {
    const t = setup();
    for (let i = 0; i < GUEST_IP_LIMIT_PER_HOUR; i++) {
      const { begin } = await send(t, { key: `g:guest-${i}-xxxxxxxxxxxx` });
      expect(begin.ok).toBe(true);
    }
    const { begin } = await send(t, { key: "g:one-more-guest-xxxxxx" });
    expect(begin).toMatchObject({ ok: false, reason: "rate_limited" });
    // Another IP is not affected.
    expect((await send(t, { key: "g:one-more-guest-xxxxxx", ip: "ip2" })).begin.ok).toBe(true);
  });
});

describe("claimGuest", () => {
  test("moves guest chats to the account, reports a picked decision, closes the guest id", async () => {
    const t = setup();
    await send(t);
    const convoId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("conversations", {
        title: "t",
        tag: "life",
        podFriendIds: ["a"],
        username: `guest:${GID}`,
        createdAt: Date.now(),
      });
      await ctx.db.insert("messages", { conversationId: id, from: "user", text: "hi", timestamp: Date.now() });
      await ctx.db.insert("decisions", {
        conversationId: id,
        question: "q",
        options: [],
        selectedOptionId: "o1",
        createdAt: Date.now(),
      });
      return id;
    });
    const res = await t.mutation(internal.guests.claimGuest, { guestId: GID, username: "alice" });
    expect(res).toEqual({ moved: 1, activated: true });
    const convo = await t.run((ctx) => ctx.db.get(convoId));
    expect(convo?.username).toBe("alice");
    const { begin } = await send(t);
    expect(begin).toMatchObject({ ok: false, reason: "signed_up" });
  });

  test("rejects a malformed guest id and moves nothing", async () => {
    const t = setup();
    expect(await t.mutation(internal.guests.claimGuest, { guestId: "short", username: "alice" })).toEqual({
      moved: 0,
      activated: false,
    });
  });
});
