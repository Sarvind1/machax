import { describe, expect, it } from "vitest";
import { FRIENDS } from "./friends";
import { RECENT_CHAT_MESSAGES, buildFriendPrompt, buildStorySummaryPrompt, chatLanguage, formatRecentChat, languageBlock, parseStoryReply, smallTalkInstruction, storySummaryDue } from "./orchestrator";

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

  it("adds this friend's vibe note after the instruction, as a nudge", () => {
    const prompt = buildFriendPrompt({
      friendName: b.name, otherNames: [a.name], userName: "Rhea", messages, language: "",
      mode: "hangout", note: "be warm, ask about her day",
    });
    expect(prompt).toContain("Rhea seems to want to just hang out and chat right now");
    expect(prompt).toContain("For you: be warm, ask about her day");
    expect(prompt).toContain("your character wins");
    expect(prompt.indexOf("For you:")).toBeGreaterThan(prompt.indexOf("React to Rhea's latest message"));
  });

  it("has no vibe line without a mode or note", () => {
    const prompt = buildFriendPrompt({ friendName: b.name, otherNames: [], userName: "Rhea", messages, language: "" });
    expect(prompt).not.toContain("For you:");
    expect(prompt).not.toContain("seems to want");
  });
});

describe("smallTalkInstruction", () => {
  it("chats back instead of hunting for drama", () => {
    for (const pos of [0, 1]) {
      const line = smallTalkInstruction("Rhea", pos);
      expect(line).not.toMatch(/drama|spill|settle|owes them money|left them on seen/i);
    }
    expect(smallTalkInstruction("Rhea", 0)).toMatch(/ask .*one light question/i);
  });
});

describe("languageBlock", () => {
  it("tells friends to switch even when the chat so far was in English", () => {
    expect(languageBlock("Spanish", "Rhea")).toMatch(/even if earlier messages .* were in English/i);
  });
});

describe("chatLanguage", () => {
  it("keeps the vibe's language when the keyword rules guessed English for a short reply", () => {
    const vibe = { mode: "hangout" as const, language: "Spanish", notes: {} };
    expect(chatLanguage({ intent: "smalltalk", language: "English", source: "rules" }, vibe)).toBe("Spanish");
  });

  it("trusts the model's language for this message", () => {
    const vibe = { mode: "hangout" as const, language: "Spanish", notes: {} };
    expect(chatLanguage({ intent: "dilemma", language: "Hinglish (Hindi in Latin script)", source: "model" }, vibe)).toBe("Hinglish (Hindi in Latin script)");
  });

  it("uses the rules without a vibe", () => {
    expect(chatLanguage({ intent: "smalltalk", language: "English", source: "rules" })).toBe("English");
  });
});

describe("parseStoryReply", () => {
  const ids = [a.id, b.id];

  it("reads the story, mode, language and one note per friend in the chat", () => {
    const raw = `{"story":"Daniela is new.\\nShe wants friends.","mode":"hangout","language":"Spanish","notes":{"${a.id}":"be warm","${b.id}":"tease lightly","stranger":"x"}}`;
    expect(parseStoryReply(raw, ids)).toEqual({
      summary: "Daniela is new.\nShe wants friends.",
      vibe: { mode: "hangout", language: "Spanish", notes: { [a.id]: "be warm", [b.id]: "tease lightly" } },
    });
  });

  it("falls back to plain lines as the story when the reply isn't JSON", () => {
    expect(parseStoryReply("Arjun owes Rhea 15k.\nShe wants it back.", ids)).toEqual({ summary: "Arjun owes Rhea 15k.\nShe wants it back." });
  });

  it("drops an unknown mode but keeps the notes", () => {
    const raw = `{"story":"s","mode":"rant","notes":{"${a.id}":"be warm"}}`;
    expect(parseStoryReply(raw, ids)).toEqual({ summary: "s", vibe: { notes: { [a.id]: "be warm" } } });
  });

  it("returns null for an empty reply", () => {
    expect(parseStoryReply("  ", ids)).toBeNull();
  });
});

describe("buildStorySummaryPrompt", () => {
  it("uses friend names and lets the user's latest words win", () => {
    const prompt = buildStorySummaryPrompt(messages(), "Rhea", "Rhea's friend owes her 15k.");
    expect(prompt).toContain(`[${a.name}] who is she`);
    expect(prompt).toContain("Earlier summary (may be out of date):\nRhea's friend owes her 15k.");
    expect(prompt).toContain("latest words win");
  });

  it("asks for a note per friend, with different stances and at most one teasing", () => {
    const prompt = buildStorySummaryPrompt(messages(), "Rhea", undefined, [a, b]);
    expect(prompt).toContain(`${a.id} (${a.name}, ${a.role})`);
    expect(prompt).toMatch(/"notes"/);
    expect(prompt).toMatch(/at most one/i);
    expect(prompt).toMatch(/nobody roasts/i);
  });

  function messages() {
    return [
      { from: "user", text: "My friend owes me 15k" },
      { from: a.id, text: "who is she" },
      { from: "user", text: "it's Arjun" },
    ];
  }
});
