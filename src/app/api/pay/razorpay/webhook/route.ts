export const dynamic = "force-dynamic";

import { internal } from "../../../../../../convex/_generated/api";
import { getConvexAdmin, type InternalAdmin } from "@/lib/convex-server";
import { verifyWebhookSignature } from "@/lib/razorpay";

// Razorpay webhook: the source of truth for web payments (covers tabs closed
// before /verify ran). No auth header and no CORS: only the signature counts.
// Every handled or deliberately ignored event answers 200, because Razorpay
// retries anything else. Convex failures answer 500 so it does retry; every
// write here is idempotent.
//
// Razorpay dashboard > Settings > Webhooks: URL /api/pay/razorpay/webhook,
// secret RAZORPAY_WEBHOOK_SECRET, events payment.captured, payment.failed,
// refund.processed.

type Entity = { id?: string; order_id?: string; payment_id?: string; amount?: number };
type WebhookPayload = {
  event?: string;
  payload?: { payment?: { entity?: Entity }; refund?: { entity?: Entity } };
};

const LOG = "[api/pay/razorpay/webhook]";
const ok = () => Response.json({ ok: true });

export async function POST(request: Request) {
  // HMAC over the raw body, before any parsing.
  const rawBody = await request.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error(LOG, "RAZORPAY_WEBHOOK_SECRET not set");
    return Response.json({ error: "payments_not_configured" }, { status: 500 });
  }
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const event = body.event ?? "";
  if (event !== "payment.captured" && event !== "payment.failed" && event !== "refund.processed") {
    return ok();
  }

  const payment = body.payload?.payment?.entity;
  const orderId = payment?.order_id;
  if (!orderId) {
    console.warn(LOG, `${event} without an order id`);
    return ok();
  }

  try {
    const admin = getConvexAdmin() as unknown as InternalAdmin;
    const order = await admin.query(internal.orders.getByProviderOrderId, { providerOrderId: orderId });
    if (!order || order.provider !== "razorpay") {
      // Not ours (e.g. another product on the same Razorpay account): no retries.
      console.warn(LOG, `${event} for unknown order ${orderId}`);
      return ok();
    }

    if (event === "payment.failed") {
      // A failed attempt can precede a successful retry: only open orders go to failed.
      if (order.status === "created") {
        await admin.mutation(internal.orders.setStatus, { providerOrderId: orderId, status: "failed" });
      }
      return ok();
    }

    if (event === "payment.captured") {
      if (order.status === "refunded") {
        console.warn(LOG, `capture for refunded order ${orderId}: ignored`);
        return ok();
      }
      if (payment?.amount !== order.amountPaise) {
        console.error(LOG, `capture for order ${orderId} is ${payment?.amount} paise, order is ${order.amountPaise}: not granted`);
        return ok();
      }
    }

    if (event === "refund.processed") {
      // Refunded before any grant happened: close the order so a late capture grants nothing.
      if (order.status === "created") {
        await admin.mutation(internal.orders.setStatus, { providerOrderId: orderId, status: "refunded" });
        return ok();
      }
      // paidAt marks a granted order; a "refunded" order without it was never granted.
      const granted = order.status === "paid" || (order.status === "refunded" && order.paidAt !== undefined);
      if (!granted) {
        console.warn(LOG, `refund for order ${orderId} in status ${order.status}: ignored`);
        return ok();
      }
    }

    // grantPurchase and adjust need the credits row, which needs the username.
    const user = await admin.query(internal.users.getByFirebaseUid, { uid: order.uid });
    if (!user) {
      console.warn(LOG, `${event} for order ${orderId}: account ${order.uid} no longer exists`);
      return ok();
    }
    await admin.mutation(internal.credits.ensure, { uid: order.uid, username: user.username });

    if (event === "payment.captured") {
      await admin.mutation(internal.credits.grantPurchase, {
        uid: order.uid,
        amountMicros: order.creditMicros,
        ref: orderId,
        meta: { provider: "razorpay", paymentId: payment?.id, source: "webhook" },
      });
      if (order.status !== "paid" && order.status !== "refunded") {
        await admin.mutation(internal.orders.setStatus, {
          providerOrderId: orderId,
          status: "paid",
          paidAt: Date.now(),
        });
      }
      return ok();
    }

    // refund.processed on a granted order: take back the refunded share of the pack.
    const refund = body.payload?.refund?.entity;
    if (!refund?.id || typeof refund.amount !== "number" || refund.amount <= 0) {
      console.warn(LOG, `refund for order ${orderId} without an id or amount`);
      return ok();
    }
    const refundPaise = Math.min(refund.amount, order.amountPaise);
    const amountMicros = -Math.round((order.creditMicros * refundPaise) / order.amountPaise);
    if (amountMicros !== 0) {
      await admin.mutation(internal.credits.adjust, {
        uid: order.uid,
        amountMicros,
        ref: `refund:${refund.id}`,
        meta: { provider: "razorpay", orderId, paymentId: payment?.id, refundPaise: refund.amount },
      });
    }
    await admin.mutation(internal.orders.setStatus, { providerOrderId: orderId, status: "refunded" });
    return ok();
  } catch (err) {
    console.error(LOG, `${event} for order ${orderId} failed:`, err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
