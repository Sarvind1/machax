#!/usr/bin/env node

/**
 * Content Loop Generator — Multi-turn + Paginated Screenshots
 *
 * Sends seed messages, gets bot responses, generates a smart follow-up,
 * gets more responses, then splits into mobile-friendly screenshot pages.
 *
 * Usage:
 *   node scripts/generate-content.mjs "should i quit my job and freelance?"
 *   node scripts/generate-content.mjs                # uses built-in seed messages
 *
 * Prerequisites: dev server running on localhost:3000
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUTPUT_DIR = join(process.cwd(), "content-output");
const MSGS_PER_PAGE = 5;

// Default seed messages for content generation
const SEED_MESSAGES = [
  "should i quit my job and go freelance?",
  "i think i'm falling for my best friend... what do i do",
];

// Pod of friends to include (core characters)
const POD = ["reeva", "aarushi", "priya", "tanmay", "arjun", "mira", "sid"];

async function callChat(message, history = []) {
  console.log(`  📨 Sending: "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);

  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      podFriendIds: POD,
      history,
      userName: "you",
      sessionMood: { modes: ["hot-take"], pacing: "snappy", energy: "up" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API returned ${response.status}: ${await response.text()}`);
  }

  const messages = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.from && data.text) {
          console.log(`    💬 ${data.from}: ${data.text.slice(0, 55)}${data.text.length > 55 ? "..." : ""}`);
          messages.push({ from: data.from, text: data.text, isUser: false });
        }
        if (data.done) break;
      } catch {
        // skip malformed
      }
    }
  }

  return messages;
}

async function generateFollowup(allMessages) {
  console.log(`  🤔 Generating follow-up...`);

  const response = await fetch(`${BASE}/api/content/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: allMessages }),
  });

  if (!response.ok) {
    throw new Error(`Followup API returned ${response.status}: ${await response.text()}`);
  }

  const { text } = await response.json();
  console.log(`  ↩️  Follow-up: "${text}"`);
  return text;
}

async function savePageAsImage(allMessages, pageIdx, slug, timestamp, size, start, totalPages) {
  const pageMessages = allMessages.slice(start, start + size);
  const response = await fetch(`${BASE}/api/content/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: pageMessages,
      isFirstPage: pageIdx === 0,
      isLastPage: pageIdx === totalPages - 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Image API returned ${response.status}: ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${slug}-${timestamp}-p${pageIdx + 1}.png`;
  const outPath = join(OUTPUT_DIR, filename);
  writeFileSync(outPath, buffer);
  return outPath;
}

async function generateConversation(seedMessage) {
  console.log(`\n🎬 Seed: "${seedMessage}"`);

  const allMessages = [];

  // === ROUND 1: User seed message ===
  allMessages.push({ from: "user", text: seedMessage, isUser: true });
  const round1 = await callChat(seedMessage);
  allMessages.push(...round1);
  console.log(`  ✅ Round 1: ${round1.length} bot responses`);

  // === GENERATE FOLLOW-UP ===
  const followup = await generateFollowup(allMessages);

  // === ROUND 2: User follow-up ===
  allMessages.push({ from: "user", text: followup, isUser: true });
  const history = allMessages.map((m) => ({ from: m.isUser ? "user" : m.from, text: m.text }));
  const round2 = await callChat(followup, history);
  allMessages.push(...round2);
  console.log(`  ✅ Round 2: ${round2.length} bot responses`);

  return allMessages;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const seeds = process.argv.length > 2
    ? [process.argv.slice(2).join(" ")]
    : SEED_MESSAGES;

  console.log(`🌱 Generating multi-turn content for ${seeds.length} seed(s)...`);
  console.log(`📡 Using: ${BASE}`);
  console.log(`📱 Page size: ${MSGS_PER_PAGE} messages per screenshot`);

  for (const seed of seeds) {
    try {
      const messages = await generateConversation(seed);

      const slug = seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const timestamp = Date.now();

      // Save raw JSON
      const jsonPath = join(OUTPUT_DIR, `${slug}-${timestamp}.json`);
      writeFileSync(jsonPath, JSON.stringify(messages, null, 2));

      // Build page breaks — avoid orphan last pages (< 3 messages)
      const pageBreaks = [];
      let remaining = messages.length;
      let offset = 0;
      while (remaining > 0) {
        // If the leftover after this page would be < 3, absorb it into this page
        const leftAfter = remaining - MSGS_PER_PAGE;
        const take = leftAfter > 0 && leftAfter < 3 ? remaining : Math.min(MSGS_PER_PAGE, remaining);
        pageBreaks.push({ start: offset, size: take });
        offset += take;
        remaining -= take;
      }

      console.log(`  📸 Generating ${pageBreaks.length} screenshot pages...`);

      const paths = [];
      for (let p = 0; p < pageBreaks.length; p++) {
        const { start, size } = pageBreaks[p];
        const path = await savePageAsImage(messages, p, slug, timestamp, size, start, pageBreaks.length);
        paths.push(path);
        console.log(`    💾 Page ${p + 1}/${pageBreaks.length}: ${path} (${size} msgs)`);
      }

      console.log(`  🎉 Done! ${messages.length} messages → ${pageBreaks.length} pages`);
    } catch (err) {
      console.error(`  ❌ Failed for "${seed}":`, err.message);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
