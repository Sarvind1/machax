export const dynamic = "force-dynamic";

import { spawnSync } from "child_process";

interface Message {
  from: string;
  text: string;
  isUser: boolean;
}

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: Message[] };

    if (!messages?.length) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    // Build conversation transcript
    const transcript = messages
      .map((m) => (m.isUser ? `[you] ${m.text}` : `[${m.from}] ${m.text}`))
      .join("\n");

    const prompt = `You are a young Indian person in a group chat with your friends. You just sent a message and your friends responded. Now you want to reply — respond to what they said, elaborate on your situation, maybe agree with one friend and push back on another. Be natural, casual, lowercase.

Here's the conversation so far:
${transcript}

Rules:
- Write ONE short follow-up message (under 25 words)
- Reference at least one friend by name and react to their specific point
- Add a new detail about your situation that moves the conversation forward
- Sound like a real person texting — use "lol", "tbh", "ngl", abbreviations naturally
- Don't ask a generic question — make a statement or share a specific detail
- Lowercase, no AI disclaimers

Reply with ONLY the follow-up message text, nothing else.`;

    // Use Claude CLI locally — free, no API tokens needed
    // spawnSync avoids shell interpretation of user input (command injection)
    const child = spawnSync(
      "claude",
      ["-p", "--model", "claude-haiku-4-5-20251001"],
      {
        input: prompt,
        timeout: 30000,
        encoding: "utf-8",
      }
    );
    if (child.status !== 0) {
      throw new Error(
        `Claude CLI exited with status ${child.status}: ${(child.stderr || "").slice(0, 500)}`
      );
    }
    const result = (child.stdout || "").trim();

    return Response.json({ text: result });
  } catch (err) {
    console.error("Followup generation error:", err);
    return Response.json(
      { error: "Failed to generate followup" },
      { status: 500 }
    );
  }
}
