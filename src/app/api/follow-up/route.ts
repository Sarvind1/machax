export const dynamic = "force-dynamic";

// POST /api/follow-up — called when the chat page opens. If the user picked an
// option in an earlier chat (at least FOLLOW_UP_MIN_AGE_MS ago) and nobody has
// asked how it went, a friend who voted for that option asks now. The message
// is saved in that conversation and returned so the page can open it.
// Returns { followUp: null } when there is nothing to ask.

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { authErrorResponse } from "@/lib/server-auth";
import { getActiveProvider } from "@/lib/providers";
import { callModel, languageBlock } from "@/lib/orchestrator";
import { FRIENDS_BY_ID } from "@/lib/friends";
import { classifyByRules } from "@/lib/intent";
import { GUEST_ID_RE, GUEST_USERNAME_PREFIX } from "@/lib/guest-limits";

type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

const DEFAULT_MIN_AGE_MS = 8 * 60 * 60 * 1000; // a pick from this morning gets asked about tonight

function followUpMinAgeMs(): number {
  const raw = process.env.FOLLOW_UP_MIN_AGE_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_AGE_MS;
}

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  try {
    // Signed in: the token says who. A guest sends its guest id instead; its
    // chats are stored under "guest:<id>".
    const hasToken = (request.headers.get("authorization") ?? "").trim() !== "";
    let username: string;
    let name: string | undefined;
    if (hasToken) {
      ({ username, name } = await bootstrapUser(request));
    } else {
      const body = (await request.json().catch(() => null)) as { guestId?: unknown } | null;
      const guestId = body?.guestId;
      if (typeof guestId !== "string" || !GUEST_ID_RE.test(guestId)) {
        return Response.json({ followUp: null }, { status: 400, headers: cors });
      }
      username = `${GUEST_USERNAME_PREFIX}${guestId}`;
    }
    const convex = getConvexAdmin() as unknown as AdminMutations;
    const due = await convex.mutation(internal.decisions.claimFollowUp, {
      username,
      minAgeMs: followUpMinAgeMs(),
    });
    if (!due) return Response.json({ followUp: null }, { headers: cors });

    const friendId =
      due.option.voices.find((id) => due.podFriendIds.includes(id)) ?? due.podFriendIds[0];
    const friend = FRIENDS_BY_ID[friendId];
    const provider = getActiveProvider();
    if (!friend || !provider) return Response.json({ followUp: null }, { headers: cors });

    // Cards (vote, chips, helpline) are stored as "card:<kind>" messages holding JSON: not chat.
    const chat = due.recent.filter((m) => !m.from.startsWith("card:"));
    const userText = chat.filter((m) => m.from === "user").map((m) => m.text).join("\n");
    const language = classifyByRules(userText || due.question).language;
    const userName = name ?? "your friend";
    const transcript = chat
      .map((m) => `[${m.from === "user" ? userName : FRIENDS_BY_ID[m.from]?.name ?? m.from}] ${m.text}`)
      .join("\n");
    const prompt = `You are ${friend.name} (${friend.role}) in a friends group chat on WhatsApp. Some time ago the group talked about this:

${transcript}

They were deciding: "${due.question}". ${userName} picked: "${due.option.label}". Ask about THAT pick, not any other option.
${languageBlock(language, userName)}
Open the chat again with ONE short line asking how it went: did they actually do it, what happened? Make it specific to their situation and in your own voice, playful (like "so... did you ask for the 15k or nah?"). Under 18 words. Don't use their name. No quotes, no name prefix.`;

    const { text } = await callModel(friend.systemPrompt, prompt, { ...provider, model: provider.synthesisModel }, 120);
    const line = text.trim().replace(/^["']|["']$/g, "").replace(new RegExp(`^${friend.name}:\\s*`, "i"), "");
    if (!line) return Response.json({ followUp: null }, { headers: cors });

    await convex.mutation(internal.decisions.saveFollowUpMessage, {
      conversationId: due.conversationId,
      from: friendId,
      text: line,
    });
    return Response.json(
      { followUp: { conversationId: due.conversationId, podFriendIds: due.podFriendIds, from: friendId, text: line } },
      { headers: cors },
    );
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("Follow-up error:", err);
    return Response.json({ followUp: null }, { status: 500, headers: cors });
  }
}
