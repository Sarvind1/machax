import { AuthRequired, authedFetch } from "./api";
import type { CreditSummary } from "./credits";

// Browser half of the web top-up: create an order on our server, open
// Razorpay Checkout, then have our server verify the payment and grant credit.

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Thrown with copy that is safe to show the user as is.
export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (res: CheckoutSuccess) => void;
  modal: { ondismiss: () => void };
};

type RazorpayInstance = {
  open(): void;
  on(event: "payment.failed", cb: () => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayInstance;
  }
}

let scriptLoad: Promise<void> | null = null;

// Adds checkout.js to the page once. A failed load is forgotten so the next
// tap can try again.
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      script.remove();
      reject(new PaymentError("couldn't load payments, check your connection"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

type OrderResponse = { orderId: string; keyId: string; amount: number; currency: string };

// Resolves once Razorpay has the money and our server has verified it.
// Rejects with AuthRequired when signed out, PaymentError otherwise.
export async function buyTopupWeb(): Promise<{ granted: boolean; credits: CreditSummary }> {
  try {
    await loadCheckout();

    const orderRes = await authedFetch("/api/pay/razorpay/order", { method: "POST" });
    if (orderRes.status === 401) throw new AuthRequired();
    if (!orderRes.ok) throw new PaymentError("couldn't start payment, try again");
    const order = (await orderRes.json()) as OrderResponse;

    const success = await new Promise<CheckoutSuccess>((resolve, reject) => {
      // Checkout stays open after a failed attempt so the user can retry;
      // only closing it ends the purchase.
      let failed = false;
      const rzp = new window.Razorpay!({
        key: order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "machax",
        description: "top up",
        handler: resolve,
        modal: {
          ondismiss: () =>
            reject(new PaymentError(failed ? "payment didn't go through" : "payment cancelled")),
        },
      });
      rzp.on("payment.failed", () => {
        failed = true;
      });
      rzp.open();
    });

    const verifyRes = await authedFetch("/api/pay/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: success.razorpay_order_id,
        paymentId: success.razorpay_payment_id,
        signature: success.razorpay_signature,
      }),
    });
    if (verifyRes.status === 401) throw new AuthRequired();
    if (!verifyRes.ok) {
      throw new PaymentError("payment didn't go through. if you were charged, credit lands in a few minutes");
    }
    return (await verifyRes.json()) as { granted: boolean; credits: CreditSummary };
  } catch (err) {
    if (err instanceof AuthRequired || err instanceof PaymentError) throw err;
    console.error("[razorpay-checkout] failed:", err);
    throw new PaymentError("payment didn't go through");
  }
}
