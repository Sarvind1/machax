import { describe, expect, it } from "vitest";
import { FRIENDS } from "./friends";
import { RECENT_CHAT_MESSAGES, buildFriendPrompt, buildStorySummaryPrompt, formatRecentChat, storySummaryDue } from "./orchestrator";

const [a, b] = FRIENDS;

describe("storySummaryDue", () => {
  it("has no summary before the 2nd user message", () => {
    expect(storySummaryDue(0)).toBe(false);
    expect(storySummaryDue(1)).toBe(false);
  });

  it("refreshes on user messages 2, 4, 6 and reuses it in between", () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(storySummaryDue)).toEqual([true, false, true, false, true, false, true]);
  });
});

describe("formatRecentChat", () => {
  it("names who said what and who they replied to", () => {
    const chat = formatRecentChat(
      [
        { from: "user", text: "Arjun owes me" },
        { from: a.id, text: "ask him", replyTo: "user" },
        { from: b.id, text: "nah wait", replyTo: a.id },
      ],
      "Rhea",
    );
    expect(chat).toBe(`[Rhea] Arjun owes me\n[${a.name}, replying to Rhea] ask him\n[${b.name}, replying to ${a.name}] nah wait`);
  });

  it("shows only the newest messages", () => {
    const many = Array.from({ length: RECENT_CHAT_MESSAGES + 5 }, (_, i) => ({ from: "user", text: `m${i}` }));
    const lines = formatRecentChat(many, "Rhea").split("\n");
    expect(lines).toHaveLength(RECENT_CHAT_MESSAGES);
    expect(lines[0]).toBe("[Rhea] m5");
  });
});

describe("buildFriendPrompt", () => {
  const messages = [
    { from: "user", text: "My friend owes me 15k" },
    { from: a.id, text: "who is she", replyTo: "user" },
    { from: "user", text: "it's Arjun" },
  ];

  it("has the main character, story so far, recent chat and one instruction", () => {
    const prompt = buildFriendPrompt({
      friendName: b.name,
      otherNames: [a.name],
      userName: "Rhea",
      messages,
      storySummary: "Arjun owes Rhea 15k.",
      language: "Hinglish",
    });
    expect(prompt).toContain("This is Rhea's chat.");
    expect(prompt).toContain("Story so far:\nArjun owes Rhea 15k.");
    expect(prompt).toContain(`[${a.name}, replying to Rhea] who is she`);
    expect(prompt).toContain(`You're ${b.name}. React to Rhea's latest message ("it's Arjun") in 1-3 lines, or stay quiet`);
    expect(prompt).toContain("don't invent shared history");
    expect(prompt).toContain("Reply in Hinglish");
    expect(prompt).not.toMatch(/Others already said|You already said|NEVER say|MODE:|You're responding to/);
  });

  it("leaves the story out when there is none yet", () => {
    const prompt = buildFriendPrompt({ friendName: b.name, otherNames: [], userName: "Rhea", messages, language: "" });
    expect(prompt).not.toContain("Story so far");
  });
});

describe("buildStorySummaryPrompt", () => {
  it("uses friend names and lets the user's latest words win", () => {
    const prompt = buildStorySummaryPrompt(messages(), "Rhea", "Rhea's friend owes her 15k.");
    expect(prompt).toContain(`[${a.name}] who is she`);
    expect(prompt).toContain("Earlier summary (may be out of date):\nRhea's friend owes her 15k.");
    expect(prompt).toContain("latest words win");
  });

  function messages() {
    return [
      { from: "user", text: "My friend owes me 15k" },
      { from: a.id, text: "who is she" },
      { from: "user", text: "it's Arjun" },
    ];
  }
});
