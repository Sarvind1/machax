export const dynamic = "force-dynamic";

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { requestPlatform } from "@/lib/chat-log";
import { GUEST_ID_RE } from "@/lib/guest-limits";

// The chat page sends one timing row per round here (src/lib/round-log.ts):
// when typing and each reply showed on the phone, plus any issues it saw.
// No auth: it is a log, every field is capped, and a bad body is dropped.

type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

const KINDS = new Set(["message", "pick", "card"]);
const ENDS = new Set(["completed", "cut-off", "rejected", "error"]);
const MAX_STEPS = 300;
const MAX_STEPS_JSON = 30_000;

const str = (x: unknown, max: number) => (typeof x === "string" && x.length > 0 ? x.slice(0, max) : undefined);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = str(body?.kind, 10);
  const endReason = str(body?.endReason, 20);
  const startedAt = num(body?.startedAt);
  if (!body || !kind || !KINDS.has(kind) || !endReason || !ENDS.has(endReason) || startedAt === undefined || !Array.isArray(body.steps)) {
    return Response.json({ error: "bad_request" }, { status: 400, headers: cors });
  }
  const steps = JSON.stringify(body.steps.slice(0, MAX_STEPS)).slice(0, MAX_STEPS_JSON);
  const issues = Array.isArray(body.issues) ? body.issues.slice(0, 20).map((i) => str(i, 40)).filter((i): i is string => !!i) : [];
  const guestId = str(body.guestId, 64);
  const who = guestId && GUEST_ID_RE.test(guestId) ? `g:${guestId}` : str(body.who, 64);
  const conversationId = str(body.conversationId, 64);
  const status = num(body.status);
  try {
    await (getConvexAdmin() as unknown as AdminMutations).mutation(internal.chatLog.recordClientRound, {
      kind,
      endReason,
      startedAt,
      steps,
      issues,
      platform: requestPlatform(request),
      appVersion: str(body.appVersion, 40) ?? "unknown",
      ...(who ? { who } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(status !== undefined ? { status } : {}),
    });
  } catch (err) {
    console.error("client round log failed:", err);
  }
  if (issues.length > 0) {
    console.warn("[machax]", JSON.stringify({ event: "client-round-issue", who, conversationId, kind, endReason, issues }));
  }
  return new Response(null, { status: 204, headers: cors });
}
