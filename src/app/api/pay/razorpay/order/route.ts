export const dynamic = "force-dynamic";

import { internal } from "../../../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { getConvexAdmin, type InternalAdmin } from "@/lib/convex-server";
import { TOPUP_MICROS, TOPUP_PAISE, TOPUP_PRODUCT_ID } from "@/lib/credits";
import { createOrder, razorpayKeys } from "@/lib/razorpay";
import { authErrorResponse } from "@/lib/server-auth";

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

// Start a ₹219 top-up. The price is fixed server-side: any amount in the
// request body is ignored. The order is recorded for verify/webhook to grant.
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  try {
    const { user } = await bootstrapUser(request);
    const keys = razorpayKeys();
    if (!keys) {
      console.error("[api/pay/razorpay/order] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
      return Response.json({ error: "payments_not_configured" }, { status: 500, headers });
    }

    const order = await createOrder(
      TOPUP_PAISE,
      { uid: user.uid, productId: TOPUP_PRODUCT_ID },
      keys.keyId,
      keys.keySecret,
    );
    const admin = getConvexAdmin() as unknown as InternalAdmin;
    await admin.mutation(internal.orders.create, {
      uid: user.uid,
      provider: "razorpay",
      providerOrderId: order.id,
      productId: TOPUP_PRODUCT_ID,
      amountPaise: TOPUP_PAISE,
      creditMicros: TOPUP_MICROS,
    });

    return Response.json(
      { orderId: order.id, keyId: keys.keyId, amount: TOPUP_PAISE, currency: "INR" },
      { headers },
    );
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) return authResponse;
    console.error("[api/pay/razorpay/order] failed:", err);
    return Response.json({ error: "internal_error" }, { status: 500, headers });
  }
}
