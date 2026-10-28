export const dynamic = "force-dynamic";

import { createHash, timingSafeEqual } from "node:crypto";
import { internal } from "../../../../../../convex/_generated/api";
import { getConvexAdmin, type InternalAdmin } from "@/lib/convex-server";
import { TOPUP_MICROS, TOPUP_PAISE, TOPUP_PRODUCT_ID } from "@/lib/credits";

// RevenueCat webhook: the only way Google Play purchases reach our ledger. The
// app sets RevenueCat's appUserID to the Firebase uid, so app_user_id is ours.
// Authenticated only by the Authorization header (no CORS: RevenueCat calls it
// server to server). Handled and deliberately ignored events answer 200;
// Convex failures answer 500 so RevenueCat retries. Every write is idempotent.
//
// RevenueCat dashboard > Integrations > Webhooks: URL /api/pay/revenuecat/webhook.
// RevenueCat sends its "Authorization header" field exactly as typed, so type
// "Bearer <REVENUECAT_WEBHOOK_SECRET>" there; the whole header is compared.
//
// SANDBOX purchases (Play license testers) grant real credit too: the owner
// decides who is a license tester. The environment is kept in the ledger meta.
//
// A Play refund of a one-time product arrives as CANCELLATION: it takes the
// pack back under a separate rc-refund: ref and marks the order refunded. The
// grant and refund rules live in convex/pay.ts, shared with Razorpay.

type RcEvent = {
  type?: string;
  id?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string;
  cancel_reason?: string;
};

const LOG = "[api/pay/revenuecat/webhook]";
const GRANT_TYPES = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
const REFUND_TYPE = "CANCELLATION";
const ignored = (why: string) => Response.json({ ok: true, ignored: why });

// Constant-time compare. Hashing first makes both sides the same length, so
// the compare itself leaks nothing about the secret's length either.
function bearerMatches(header: string | null, secret: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error(LOG, "REVENUECAT_WEBHOOK_SECRET not set");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: RcEvent | undefined;
  try {
    event = ((await request.json()) as { event?: RcEvent } | null)?.event;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!event?.type) return Response.json({ error: "missing_event" }, { status: 400 });

  const type = event.type;
  if (!GRANT_TYPES.has(type) && type !== REFUND_TYPE) return ignored(type);

  const uid = event.app_user_id;
  const productId = event.product_id;
  const transactionId = event.transaction_id ?? event.id;
  if (!uid || !productId || !transactionId) {
    console.warn(LOG, `${type} ${event.id ?? "?"} without app_user_id, product_id or transaction id`);
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }
  // Bought before configurePurchases ran: there is no account to credit.
  if (uid.startsWith("$RCAnonymousID:")) {
    console.warn(LOG, `${type} ${transactionId} from anonymous RevenueCat user: not granted`);
    return ignored("anonymous_user");
  }
  if (productId !== TOPUP_PRODUCT_ID) return ignored(`product ${productId}`);

  try {
    const admin = getConvexAdmin() as unknown as InternalAdmin;
    // Either event may come first: orders.create is idempotent, and a refund
    // that lands first closes the order so the purchase grants nothing.
    await admin.mutation(internal.orders.create, {
      uid,
      provider: "play",
      providerOrderId: transactionId,
      productId: TOPUP_PRODUCT_ID,
      amountPaise: TOPUP_PAISE,
      creditMicros: TOPUP_MICROS,
    });

    if (type === REFUND_TYPE) {
      const { outcome } = await admin.mutation(internal.pay.refundOrder, {
        providerOrderId: transactionId,
        amountMicros: -TOPUP_MICROS,
        ref: `rc-refund:${transactionId}`,
        meta: { type, reason: event.cancel_reason },
      });
      if (outcome === "adjusted" || outcome === "already") {
        return Response.json({ ok: true, granted: outcome === "adjusted" });
      }
      console.warn(LOG, `refund ${transactionId} for ${uid}: ${outcome}, nothing taken back`);
      return ignored(outcome === "no_user" ? "no_account" : outcome);
    }

    const { outcome } = await admin.mutation(internal.pay.fulfillOrder, {
      providerOrderId: transactionId,
      ref: `rc:${transactionId}`,
      meta: {
        provider: "play",
        eventId: event.id,
        eventType: type,
        store: event.store,
        environment: event.environment,
      },
    });
    if (outcome === "granted" || outcome === "already") {
      return Response.json({ ok: true, granted: outcome === "granted" });
    }
    console.warn(LOG, `${type} ${transactionId} for ${uid}: ${outcome}, not granted`);
    return ignored(outcome === "no_user" ? "no_account" : outcome);
  } catch (err) {
    console.error(LOG, `${type} ${transactionId} for ${uid} failed:`, err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
