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
import { stickerColor } from "@/lib/friend-faces";

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

// Same look as the reels: bottle green, shouty headline, cream sticker bubbles.
function buildCard(decision: Decision, pickedId: string | null, lines: ShareLine[]): HTMLElement {
  const ink = "#1A1410";
  const display = "var(--font-display), Impact, 'Arial Narrow', sans-serif";
  const body = "var(--font-body), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const root = el("div", {
    width: "1080px",
    padding: "72px",
    boxSizing: "border-box",
    background: "radial-gradient(120% 70% at 30% 30%, #1E6B47 0%, #0F4D32 45%, #0A3824 100%)",
    color: "#FFF6E5",
    fontFamily: body,
    display: "flex",
    flexDirection: "column",
    gap: "30px",
  });
  root.appendChild(
    el("div", { alignSelf: "flex-start", background: "#FFF6E5", color: ink, borderRadius: "999px", padding: "10px 26px", fontSize: "30px", fontWeight: "700" }, "MachaX group chat"),
  );
  root.appendChild(
    el("div", { fontFamily: display, fontSize: "88px", lineHeight: "0.95", textTransform: "uppercase", color: "#FFD23F", textShadow: "4px 4px 0 #0A3824" }, decision.question),
  );

  for (const line of lines) {
    const f = FRIENDS_BY_ID[line.from];
    const bubble = el("div", {
      alignSelf: "flex-start",
      background: "#FFF6E5",
      color: ink,
      border: `5px solid ${ink}`,
      boxShadow: `8px 8px 0 ${ink}`,
      borderRadius: "36px 36px 36px 12px",
      padding: "22px 32px 26px",
      maxWidth: "880px",
      fontSize: "40px",
      lineHeight: "1.28",
    });
    bubble.appendChild(el("div", { fontSize: "28px", fontWeight: "800", marginBottom: "4px", color: stickerColor(line.from).ink }, (f?.name ?? line.from).toLowerCase()));
    bubble.appendChild(el("div", {}, line.text));
    root.appendChild(bubble);
  }

  const votes = el("div", { display: "flex", flexDirection: "column", gap: "14px", marginTop: "10px" });
  votes.appendChild(el("div", { fontFamily: "var(--font-caveat), cursive", fontSize: "44px", fontWeight: "700", color: "#CDEBD5" }, "the group votes"));
  for (const o of decision.options) {
    const picked = o.id === pickedId;
    votes.appendChild(
      el(
        "div",
        {
          alignSelf: "flex-start",
          fontSize: "34px",
          fontWeight: picked ? "800" : "600",
          background: picked ? "#FFD23F" : "transparent",
          color: picked ? ink : "#FFF6E5",
          border: picked ? `4px solid ${ink}` : "4px solid transparent",
          borderRadius: "18px",
          padding: "8px 20px",
        },
        `${picked ? "✓ " : ""}${o.label} — ${o.voices.length} ${o.voices.length === 1 ? "vote" : "votes"}`,
      ),
    );
  }
  root.appendChild(votes);
  root.appendChild(el("div", { fontSize: "28px", color: "#CDEBD5", marginTop: "12px" }, FOOTER));
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
