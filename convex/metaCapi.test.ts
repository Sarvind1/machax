// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { capiEventName } from "./metaCapi";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// A real user with one decision, picked or not.
async function setup(picked: boolean) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { username: "alice", password: "", firebaseUid: "uidA", createdAt: 1 });
    const conversationId = await ctx.db.insert("conversations", {
      username: "alice",
      title: "t",
      tag: "life",
      podFriendIds: ["a"],
      createdAt: 1,
    });
    await ctx.db.insert("decisions", {
      conversationId,
      question: "q",
      options: [],
      ...(picked ? { selectedOptionId: "o1" } : {}),
      createdAt: 1,
    });
  });
  return t;
}

const claim = (t: Awaited<ReturnType<typeof setup>>, eventName: "fb_mobile_achievement_unlocked" | "Activated", eventId: string) =>
  t.mutation(internal.metaCapi.claim, { username: "alice", eventName, eventId });

describe("metaCapi.claim achievement unlocked", () => {
  test("needs a picked decision", async () => {
    const t = await setup(false);
    expect(await claim(t, "fb_mobile_achievement_unlocked", "e1")).toBeNull();
  });

  test("fires once per user", async () => {
    const t = await setup(true);
    expect(await claim(t, "fb_mobile_achievement_unlocked", "e1")).not.toBeNull();
    expect(await claim(t, "fb_mobile_achievement_unlocked", "e2")).toBeNull();
  });

  test("a user already sent the old Activated event does not fire again", async () => {
    const t = await setup(true);
    expect(await claim(t, "Activated", "e1")).not.toBeNull();
    expect(await claim(t, "fb_mobile_achievement_unlocked", "e2")).toBeNull();
  });

  test("an old app build sending Activated after the new event is blocked too", async () => {
    const t = await setup(true);
    expect(await claim(t, "fb_mobile_achievement_unlocked", "e1")).not.toBeNull();
    expect(await claim(t, "Activated", "e2")).toBeNull();
  });
});

describe("capiEventName matches what the SDK logs", () => {
  test("sign-up goes to Meta under the SDK's name", () => {
    expect(capiEventName("CompleteRegistration")).toBe("fb_mobile_complete_registration");
  });

  test("other names pass through", () => {
    expect(capiEventName("fb_mobile_achievement_unlocked")).toBe("fb_mobile_achievement_unlocked");
    expect(capiEventName("Activated")).toBe("Activated");
  });
});
