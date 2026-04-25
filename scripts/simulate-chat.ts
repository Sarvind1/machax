#!/usr/bin/env npx tsx

/**
 * MachaX Conversation Simulator + AI Reviewer
 *
 * Runs the conversation engine with test prompts, collects responses,
 * then has an AI reviewer evaluate the conversation quality.
 *
 * Usage: npx tsx scripts/simulate-chat.ts [prompt] [userName]
 * Example: npx tsx scripts/simulate-chat.ts "Should I quit my job?"
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

// ── Load .env.local before any imports that need env vars ──
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local might not exist
  }
}

const projectRoot = resolve(import.meta.dirname ?? __dirname, "..");
loadEnvFile(resolve(projectRoot, ".env.local"));

// Provider selection:
// - By default, uses Claude CLI if available (matches local dev server behavior)
// - Set FORCE_GEMINI=1 to force Gemini (matches Vercel production behavior)
if (process.env.FORCE_GEMINI === "1") {
  try {
    const claudeBin = execSync("which claude", { encoding: "utf-8" }).trim();
    if (claudeBin) {
      const claudeDir = resolve(claudeBin, "..");
      process.env.PATH = (process.env.PATH || "")
        .split(":")
        .filter((p) => resolve(p) !== claudeDir)
        .join(":");
    }
  } catch {
    // claude not found, nothing to remove
  }
}

// ── Now import modules that depend on env vars ──
import { orchestrateChat } from "../src/lib/orchestrator";
import { selectPod } from "../src/lib/friends";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// Test prompts if none provided via CLI
const TEST_PROMPTS = [
  "Pizza or burger?",
  "Should I quit my job?",
  "I think I'm in love with my best friend",
  "Should I buy a MacBook or ThinkPad?",
  "My roommate keeps eating my food, what do I do?",
];

interface SimMessage {
  from: string;
  text: string;
  replyTo?: string;
  event: string;
}

async function runSimulation(
  prompt: string,
  userName: string = "Sarvind",
): Promise<SimMessage[]> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PROMPT: "${prompt}" (as ${userName})`);
  console.log(`${"=".repeat(60)}\n`);

  // Select a pod based on generic tags
  const pod = selectPod(["life", "career", "relationships", "feelings"]);
  const podIds = pod.map((f) => f.id);
  console.log(
    `POD: ${pod.map((f) => `${f.name} (${f.category})`).join(", ")}\n`,
  );

  const messages: SimMessage[] = [];
  const startTime = Date.now();

  const generator = orchestrateChat({
    message: prompt,
    podFriendIds: podIds,
    history: [],
    userName,
  });

  for await (const event of generator) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    switch (event.type) {
      case "provider":
        console.log(`  [${elapsed}s] >> Provider: ${event.label}`);
        break;
      case "typing":
        console.log(`  [${elapsed}s] ... ${event.agentId} typing`);
        break;
      case "typing-stop":
        // quiet
        break;
      case "message": {
        const msg: SimMessage = {
          from: event.from,
          text: event.text,
          replyTo: event.replyTo,
          event: "message",
        };
        messages.push(msg);
        const prefix = event.from === "user" ? ">>" : "  ";
        const replyTag = event.replyTo ? ` (reply->${event.replyTo})` : "";
        console.log(
          `  [${elapsed}s] ${prefix} ${event.from}${replyTag}: ${event.text}`,
        );
        break;
      }
      case "joined":
        console.log(`  [${elapsed}s] + ${event.agentId} joined`);
        break;
      case "lurking":
        console.log(`  [${elapsed}s] ~ ${event.agentId} lurking`);
        break;
      case "presence":
        console.log(
          `  [${elapsed}s] # ${event.agentId}: ${event.state}`,
        );
        break;
      case "nudge":
        console.log(`  [${elapsed}s] ! nudge`);
        break;
      case "winding-down":
        console.log(`  [${elapsed}s] ~ winding down...`);
        break;
      case "done":
        console.log(`  [${elapsed}s] -- done`);
        break;
      case "decision":
        console.log(
          `  [${elapsed}s] ** Decision: ${event.decision.question}`,
        );
        for (const opt of event.decision.options) {
          console.log(
            `     - ${opt.label}: ${opt.blurb} [${opt.voices.join(", ")}]`,
          );
        }
        break;
      default:
        console.log(`  [${elapsed}s] ?? ${(event as { type: string }).type}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Total time: ${totalTime}s | Messages: ${messages.length}`);

  return messages;
}

async function reviewConversation(
  prompt: string,
  messages: SimMessage[],
  userName: string,
): Promise<string> {
  console.log(`\n${"~".repeat(60)}`);
  console.log(`AI REVIEWER EVALUATING...`);
  console.log(`${"~".repeat(60)}\n`);

  const transcript = messages
    .map(
      (m) => `[${m.from}${m.replyTo ? ` ->${m.replyTo}` : ""}] ${m.text}`,
    )
    .join("\n");

  const reviewPrompt = `You are a quality reviewer for an AI group chat app called MachaX.
The app creates a simulated friend group chat where AI characters discuss a user's question/thought.

The user "${userName}" sent this message: "${prompt}"

Here is the conversation that the AI characters generated:

${transcript}

Evaluate this conversation on these criteria (score 1-10 for each):

1. **NATURALNESS**: Does it sound like real friends chatting? Or robotic/generic?
2. **RELEVANCE**: Are agents actually responding to the prompt, or talking past it?
3. **USER ENGAGEMENT**: Do agents address ${userName} by name? Do they ask follow-up questions? Or do they just talk among themselves?
4. **VARIETY**: Do different characters have distinct voices? Or do they all sound the same?
5. **PACING**: Are there too many/few messages? Do responses feel rushed or drawn out?
6. **LENGTH**: Are individual messages the right length for a group chat? (Should be mostly 1-2 sentences, occasional longer takes)
7. **NO FRAGMENTS**: Are there any incomplete sentences or truncated responses?
8. **ENTERTAINMENT**: Would this be fun to read? Does it create FOMO or engagement?

For each criterion, give:
- Score (1-10)
- One specific example from the conversation (good or bad)
- One specific suggestion to improve

Then give an OVERALL SCORE (1-10) and your TOP 3 most impactful fixes.

Be brutally honest. The goal is to make this feel like an actual friend group chat, not an AI demo.`;

  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [{ role: "user", content: reviewPrompt }],
      maxOutputTokens: 2000,
      temperature: 0.3,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });

    console.log(result.text);
    return result.text;
  } catch (err) {
    console.error("Review failed:", err);
    return "Review failed";
  }
}

async function main() {
  const customPrompt = process.argv[2];
  const prompts = customPrompt
    ? [customPrompt]
    : TEST_PROMPTS.slice(0, 2); // Run 2 test prompts by default
  const userName = process.argv[3] || "Sarvind";

  console.log("\n-- MachaX Conversation Simulator --");
  console.log(`Running ${prompts.length} simulation(s)...\n`);

  for (const prompt of prompts) {
    try {
      const messages = await runSimulation(prompt, userName);
      await reviewConversation(prompt, messages, userName);
    } catch (err) {
      console.error(`\nSimulation failed for "${prompt}":`, err);
    }
    console.log("\n");
  }

  console.log("-- All simulations complete. --");
}

main().catch(console.error);
