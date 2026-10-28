export const dynamic = "force-dynamic";

import { internal } from "../../../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { getConvexAdmin, type InternalAdmin } from "@/lib/convex-server";
import { summarize } from "@/lib/credits";
import { fetchPayment, razorpayKeys, verifyCheckoutSignature } from "@/lib/razorpay";
import { authErrorResponse } from "@/lib/server-auth";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Checkout can return a moment before auto-capture lands: an `authorized`
// payment gets one more look after this delay.
const CAPTURE_RETRY_MS = 1_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type VerifyBody = { orderId?: unknown; paymentId?: unknown; signature?: unknown };

// Called by the open tab right after Razorpay checkout succeeds, for an
// instant top-up. The webhook grants too if this call never arrives; the
// grant is idempotent on the order id, so whichever comes second is a no-op.
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const reject = (reason: string) => {
    console.warn("[api/pay/razorpay/verify] rejected:", reason);
    return Response.json({ error: "payment_not_verified" }, { status: 400, headers });
  };

  try {
    const { user, row } = await bootstrapUser(request);
    const keys = razorpayKeys();
    if (!keys) {
      console.error("[api/pay/razorpay/verify] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
      return Response.json({ error: "payments_not_configured" }, { status: 500, headers });
    }

    const body = (await request.json().catch(() => null)) as VerifyBody | null;
    const { orderId, paymentId, signature } = body ?? {};
    if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string") {
      return reject("missing orderId, paymentId or signature");
    }

    const admin = getConvexAdmin() as unknown as InternalAdmin;
    const order = await admin.query(internal.orders.getByProviderOrderId, { providerOrderId: orderId });
    if (!order || order.provider !== "razorpay") return reject(`unknown order ${orderId}`);
    if (order.uid !== user.uid) return reject(`order ${orderId} belongs to another user`);
    if (!verifyCheckoutSignature(orderId, paymentId, signature, keys.keySecret)) {
      return reject(`bad signature for ${orderId}`);
    }

    // Confirm with Razorpay directly: the client could be replaying anything.
    let payment = await fetchPayment(paymentId, keys.keyId, keys.keySecret);
    if (payment.status === "authorized") {
      await sleep(CAPTURE_RETRY_MS);
      payment = await fetchPayment(paymentId, keys.keyId, keys.keySecret);
    }
    if (payment.status !== "captured" || payment.order_id !== orderId || payment.amount !== order.amountPaise) {
      return reject(`payment ${paymentId} does not match order ${orderId}`);
    }

    const { granted } = await admin.mutation(internal.credits.grantPurchase, {
      uid: user.uid,
      amountMicros: order.creditMicros,
      ref: orderId,
      meta: { provider: "razorpay", paymentId, source: "verify" },
    });
    if (order.status !== "paid" && order.status !== "refunded") {
      await admin.mutation(internal.orders.setStatus, {
        providerOrderId: orderId,
        status: "paid",
        paidAt: Date.now(),
      });
    }

    const latest = await admin.query(internal.credits.get, { uid: user.uid });
    return Response.json({ granted, credits: summarize(latest ?? row) }, { headers });
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("[api/pay/razorpay/verify] failed:", err);
    return Response.json({ error: "internal_error" }, { status: 500, headers });
  }
}
