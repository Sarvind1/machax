#!/usr/bin/env npx tsx

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
  } catch {}
}

const projectRoot = resolve(import.meta.dirname ?? __dirname, "..");
loadEnvFile(resolve(projectRoot, ".env.local"));

// Force Gemini (matches Vercel production behavior)
try {
  const claudeBin = execSync("which claude", { encoding: "utf-8" }).trim();
  if (claudeBin) {
    const claudeDir = resolve(claudeBin, "..");
    process.env.PATH = (process.env.PATH || "")
      .split(":")
      .filter((p) => resolve(p) !== claudeDir)
      .join(":");
  }
} catch {}

// ── Now import modules that depend on env vars ──
import { orchestrateChat } from "../src/lib/orchestrator";
import { selectPod } from "../src/lib/friends";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set in .env.local");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);

const SCORE_PROMPT = `You are a quality reviewer for MachaX, an AI group chat app.
Evaluate this conversation and return ONLY valid JSON (no markdown, no explanation).

Return this exact shape:
{
  "naturalness": { "score": 1-10, "note": "one sentence" },
  "relevance": { "score": 1-10, "note": "one sentence" },
  "engagement": { "score": 1-10, "note": "one sentence" },
  "variety": { "score": 1-10, "note": "one sentence" },
  "pacing": { "score": 1-10, "note": "one sentence" },
  "length": { "score": 1-10, "note": "one sentence" },
  "completeness": { "score": 1-10, "note": "one sentence" },
  "entertainment": { "score": 1-10, "note": "one sentence" },
  "overall": 1-10
}

Criteria:
- NATURALNESS: Sounds like real friends texting? Or robotic/generic?
- RELEVANCE: Agents actually address the prompt?
- ENGAGEMENT: Agents address the user, ask follow-ups? Or just talk among themselves?
- VARIETY: Different characters have distinct voices?
- PACING: Right number of messages? Not too many, not too few?
- LENGTH: Messages are group-chat length (1-2 sentences mostly)?
- COMPLETENESS: No truncated or fragment responses?
- ENTERTAINMENT: Fun to read? Creates engagement?

Be brutally honest. Score 1-10 for each.`;

async function main() {
  const prompts = JSON.parse(
    readFileSync(resolve(projectRoot, "scripts/eval-prompts.json"), "utf-8")
  );
  const runName = `eval-${new Date().toISOString().slice(0, 16)}`;

  const runId = await client.mutation(api.evals.createRun, {
    name: runName,
    promptCount: prompts.length,
  });

  console.log(`\nEval run: ${runName} (${prompts.length} prompts)\n`);

  let totalScore = 0;
  let completed = 0;

  for (const evalPrompt of prompts) {
    console.log(`[${completed + 1}/${prompts.length}] "${evalPrompt.prompt}"`);

    try {
      const startTime = Date.now();
      const pod = selectPod(["life", "career", "relationships", "feelings"]);
      const podIds = pod.map((f: any) => f.id);

      const messages: { from: string; text: string }[] = [];
      const generator = orchestrateChat({
        message: evalPrompt.prompt,
        podFriendIds: podIds,
        history: [],
        userName: "TestUser",
      });

      for await (const event of generator) {
        if (event.type === "message") {
          messages.push({ from: event.from, text: event.text });
        }
      }

      const totalTimeMs = Date.now() - startTime;

      // Score with Gemini
      const transcript = messages
        .map((m) => `[${m.from}] ${m.text}`)
        .join("\n");

      const scoreResult = await generateText({
        model: google("gemini-2.5-flash"),
        messages: [
          {
            role: "user",
            content: `${SCORE_PROMPT}\n\nUser prompt: "${evalPrompt.prompt}"\n\nConversation:\n${transcript}`,
          },
        ],
        maxOutputTokens: 800,
        temperature: 0.1,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });

      // Parse JSON score
      let scores: any;
      try {
        let cleaned = scoreResult.text.trim()
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
        const startIdx = cleaned.indexOf("{");
        const endIdx = cleaned.lastIndexOf("}");
        if (startIdx >= 0 && endIdx > startIdx) {
          cleaned = cleaned.slice(startIdx, endIdx + 1);
        }
        scores = JSON.parse(cleaned);
      } catch {
        console.error("  Failed to parse score JSON, using defaults");
        scores = { overall: 5 };
      }

      const overallScore = scores.overall ?? 5;
      totalScore += overallScore;
      completed++;

      console.log(`  Score: ${overallScore}/10 | ${messages.length} msgs | ${(totalTimeMs / 1000).toFixed(1)}s`);

      await client.mutation(api.evals.saveResult, {
        evalRunId: runId,
        prompt: evalPrompt.prompt,
        messages: JSON.stringify(messages),
        scores: JSON.stringify(scores),
        overallScore,
        totalTimeMs,
        messageCount: messages.length,
      });
    } catch (err) {
      console.error(`  FAILED:`, err);
      completed++;
    }
  }

  const avgScore = completed > 0 ? parseFloat((totalScore / completed).toFixed(1)) : 0;
  await client.mutation(api.evals.completeRun, {
    id: runId,
    avgScore,
    status: "complete",
  });

  console.log(`\nDone. Avg score: ${avgScore}/10 across ${completed} prompts.`);
}

main().catch(console.error);
