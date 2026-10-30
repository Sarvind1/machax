// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const wall = { guestKey: "g:0123456789abcdef0123", source: "server" as const, reason: "typed_limit", platform: "app", typedUsed: 3, totalUsed: 3 };

describe("chatLog", () => {
  test("records a sign-in wall hit and shows it in recent()", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.chatLog.recordSignInWall, wall)).toEqual({ recorded: true });
    const r = await t.query(internal.chatLog.recent, { hours: 1 });
    expect(r.walls.total).toBe(1);
    expect(r.walls.guests).toBe(1);
    expect(r.walls.byPlatform).toEqual({ app: 1 });
    expect(r.walls.rows[0]).toMatchObject(wall);
  });

  test("dedupes the same guest and source within 30 s, but keeps a server hit after a client one", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(internal.chatLog.recordSignInWall, { ...wall, source: "client" });
      expect(await t.mutation(internal.chatLog.recordSignInWall, { ...wall, source: "client" })).toEqual({ recorded: false });
      expect(await t.mutation(internal.chatLog.recordSignInWall, wall)).toEqual({ recorded: true });
      vi.advanceTimersByTime(31_000);
      expect(await t.mutation(internal.chatLog.recordSignInWall, { ...wall, source: "client" })).toEqual({ recorded: true });
    } finally {
      vi.useRealTimers();
    }
  });

  test("records rejections, cuts long text, and counts them by reason", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.chatLog.recordRejection, { status: 400, reason: "bad_request", detail: "x".repeat(1000), platform: "web" });
    await t.mutation(internal.chatLog.recordRejection, { status: 429, reason: "rate_limited", who: "g:abc", platform: "app" });
    const r = await t.query(internal.chatLog.recent, {});
    expect(r.rejections.total).toBe(2);
    expect(r.rejections.byReason).toEqual({ bad_request: 1, rate_limited: 1 });
    const bad = r.rejections.rows.find((row) => row.reason === "bad_request")!;
    expect(bad.detail).toHaveLength(300);
  });

  test("traces.save accepts the new per-round fields", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.traces.save, {
      prompt: "hi", userName: "A", podFriendIds: [], provider: "p", totalTimeMs: 1, totalIterations: 0,
      totalMessages: 1, finalEnergy: 0, iterations: "[]", roundType: "smalltalk", endReason: "completed",
      events: "[]", who: "g:abc",
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ roundType: "smalltalk", endReason: "completed", who: "g:abc" });
  });
});
