// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const card = (a: string, b: string) => [
  { id: "opt1", label: a, blurb: "", voices: ["priya"] },
  { id: "opt2", label: b, blurb: "", voices: ["arjun"] },
];

describe("decisions.upsert", () => {
  test("a second vote card in the same chat starts unpicked, and the follow-up asks about the new pick", async () => {
    const t = convexTest(schema, modules);
    const conversationId = await t.run((ctx) =>
      ctx.db.insert("conversations", { username: "alice", title: "t", tag: "life", podFriendIds: ["priya", "arjun"], createdAt: 0 }),
    );
    const username = "alice";
    await t.mutation(api.decisions.upsert, { conversationId, username, question: "q1", options: card("ask him", "let it go") });
    await t.mutation(api.decisions.select, { conversationId, username, optionId: "opt1" });
    expect((await t.query(api.decisions.get, { conversationId, username }))?.selectedOptionId).toBe("opt1");

    // New card replaces the old one: no pick carried over.
    await t.mutation(api.decisions.upsert, { conversationId, username, question: "q2", options: card("quit", "stay") });
    const fresh = await t.query(api.decisions.get, { conversationId, username });
    expect(fresh?.question).toBe("q2");
    expect(fresh?.selectedOptionId).toBeUndefined();
    expect(fresh?.selectedAt).toBeUndefined();
    // Nothing picked yet, so no follow-up.
    expect(await t.mutation(internal.decisions.claimFollowUp, { username, minAgeMs: 0 })).toBeNull();

    await t.mutation(api.decisions.select, { conversationId, username, optionId: "opt2" });
    const due = await t.mutation(internal.decisions.claimFollowUp, { username, minAgeMs: 0 });
    expect(due).toMatchObject({ question: "q2", option: { label: "stay" } });
  });
});
