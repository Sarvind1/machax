"use client";

// "share the roast": draws the best lines of the debate plus the vote as a
// 1080px-wide PNG with the machax.xyz mark, then opens the share sheet.
// Android: writes the PNG to the app cache (Filesystem) and shares the file.
// Web: Web Share with a file where supported, otherwise a download.
// Falls back to sharing text when the image can't be made or shared.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import type { Decision } from "@/lib/types";
import { FRIENDS_BY_ID } from "@/lib/friends";

export interface ShareLine {
  from: string;
  text: string;
}

const FOOTER = "machax.xyz · 3-9 AI friends roast your life choices 💀";

/** Up to three friend lines worth sharing: the punchiest of the latest round. */
export function pickShareLines(messages: ShareLine[]): ShareLine[] {
  const lastUser = messages.map((m) => m.from).lastIndexOf("user");
  const round = messages
    .slice(lastUser + 1)
    .filter((m) => m.from !== "user" && FRIENDS_BY_ID[m.from] && m.text && !m.text.startsWith("[sent a"));
  const score = (t: string) => (/[💀😭🤣🔥]/u.test(t) ? 40 : 0) + Math.min(t.length, 120);
  const best = [...round].sort((a, b) => score(b.text) - score(a.text)).slice(0, 3);
  // Back in chat order so the card reads like the chat.
  return round.filter((m) => best.includes(m));
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(decision: Decision, pickedId: string | null, lines: ShareLine[]): HTMLElement {
  const root = el("div", {
    width: "1080px",
    padding: "72px",
    boxSizing: "border-box",
    background: "#F6F1E7",
    color: "#1D1B16",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
  });
  root.appendChild(el("div", { fontSize: "34px", fontWeight: "800", letterSpacing: "0.02em" }, "machaX group chat"));
  root.appendChild(el("div", { fontSize: "46px", fontWeight: "700", lineHeight: "1.2" }, decision.question));

  for (const line of lines) {
    const f = FRIENDS_BY_ID[line.from];
    const bubble = el("div", {
      background: f?.tintBg ?? "#FFFFFF",
      color: f?.tintInk ?? "#1D1B16",
      borderRadius: "28px",
      padding: "24px 30px",
      maxWidth: "880px",
      fontSize: "36px",
      lineHeight: "1.3",
    });
    bubble.appendChild(el("div", { fontSize: "26px", fontWeight: "700", marginBottom: "6px", color: f?.color ?? "#555" }, f?.name ?? line.from));
    bubble.appendChild(el("div", {}, line.text));
    root.appendChild(bubble);
  }

  const votes = el("div", { display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" });
  votes.appendChild(el("div", { fontSize: "26px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", opacity: "0.6" }, "the group votes"));
  for (const o of decision.options) {
    const picked = o.id === pickedId;
    votes.appendChild(
      el(
        "div",
        { fontSize: "34px", fontWeight: picked ? "800" : "500", background: picked ? "#1D1B16" : "transparent", color: picked ? "#F6F1E7" : "#1D1B16", borderRadius: "16px", padding: picked ? "10px 18px" : "0" },
        `${picked ? "✓ " : ""}${o.label} — ${o.voices.length} ${o.voices.length === 1 ? "vote" : "votes"}`,
      ),
    );
  }
  root.appendChild(votes);
  root.appendChild(el("div", { fontSize: "28px", opacity: "0.7", marginTop: "12px" }, FOOTER));
  return root;
}

async function renderPng(decision: Decision, pickedId: string | null, lines: ShareLine[]): Promise<string> {
  const { toPng } = await import("html-to-image");
  const holder = el("div", { position: "fixed", left: "-10000px", top: "0" });
  holder.appendChild(buildCard(decision, pickedId, lines));
  document.body.appendChild(holder);
  try {
    return await toPng(holder.firstChild as HTMLElement, { pixelRatio: 1, cacheBust: true });
  } finally {
    holder.remove();
  }
}

function shareText(decision: Decision, pickedId: string | null, lines: ShareLine[]): string {
  const picked = decision.options.find((o) => o.id === pickedId);
  const body = [
    decision.question,
    ...lines.map((l) => `${FRIENDS_BY_ID[l.from]?.name ?? l.from}: ${l.text}`),
    ...(picked ? [`I went with: ${picked.label}`] : []),
  ];
  return `${body.join("\n")}\n\n${FOOTER}`;
}

export async function shareRoastCard({
  decision,
  pickedId,
  lines,
}: {
  decision: Decision;
  pickedId: string | null;
  lines: ShareLine[];
}): Promise<void> {
  const text = shareText(decision, pickedId, lines);
  try {
    const dataUrl = await renderPng(decision, pickedId, lines);
    if (Capacitor.isNativePlatform()) {
      if (Capacitor.isPluginAvailable("Filesystem")) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const saved = await Filesystem.writeFile({
          path: `machax-roast-${Date.now()}.png`,
          data: dataUrl.split(",")[1],
          directory: Directory.Cache,
        });
        await Share.share({ files: [saved.uri], text: FOOTER, dialogTitle: "share the roast" });
        return;
      }
      // An older app build without the Filesystem plugin: share the words.
      await Share.share({ text, dialogTitle: "share the roast" });
      return;
    }
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "machax-roast.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: FOOTER });
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "machax-roast.png";
    a.click();
  } catch (err) {
    // Share sheet dismissed is not an error worth a fallback.
    if (err instanceof Error && /cancel|abort/i.test(err.message)) return;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ text, dialogTitle: "share the roast" });
      else if (navigator.share) await navigator.share({ text });
    } catch {
      // nothing more to try
    }
  }
}
