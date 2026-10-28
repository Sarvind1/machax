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
// RevenueCat dashboard > Integrations > Webhooks: URL /api/pay/revenuecat/webhook,
// Authorization header "Bearer <REVENUECAT_WEBHOOK_SECRET>".

type RcEvent = {
  type?: string;
  id?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string;
};

const LOG = "[api/pay/revenuecat/webhook]";
const GRANT_TYPES = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
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
  if (!GRANT_TYPES.has(type)) return ignored(type);

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
    // grantPurchase needs the credits row, which needs the username.
    const user = await admin.query(internal.users.getByFirebaseUid, { uid });
    if (!user) {
      console.warn(LOG, `${type} ${transactionId}: account ${uid} no longer exists, not granted`);
      return ignored("no_account");
    }

    await admin.mutation(internal.orders.create, {
      uid,
      provider: "play",
      providerOrderId: transactionId,
      productId: TOPUP_PRODUCT_ID,
      amountPaise: TOPUP_PAISE,
      creditMicros: TOPUP_MICROS,
    });
    await admin.mutation(internal.credits.ensure, { uid, username: user.username });
    const { granted } = await admin.mutation(internal.credits.grantPurchase, {
      uid,
      amountMicros: TOPUP_MICROS,
      ref: `rc:${transactionId}`,
      meta: {
        provider: "play",
        eventId: event.id,
        eventType: type,
        store: event.store,
        environment: event.environment,
      },
    });

    // Also covers a retry where the grant landed but marking the order failed.
    const order = await admin.query(internal.orders.getByProviderOrderId, { providerOrderId: transactionId });
    if (order?.status !== "paid") {
      await admin.mutation(internal.orders.setStatus, {
        providerOrderId: transactionId,
        status: "paid",
        paidAt: Date.now(),
      });
    }
    return Response.json({ ok: true, granted });
  } catch (err) {
    console.error(LOG, `${type} ${transactionId} for ${uid} failed:`, err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
