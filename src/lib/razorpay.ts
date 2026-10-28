import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Server-side Razorpay helpers (Node route handlers only: uses node:crypto and
// the secret key). The browser half lives in razorpay-checkout.ts.
const API = "https://api.razorpay.com/v1";

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Constant-time compare of two hex strings. Different lengths are a mismatch.
function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Checkout success signature: HMAC-SHA256(`${order_id}|${payment_id}`) keyed
// with the API key secret (not the webhook secret).
export function signCheckout(orderId: string, paymentId: string, secret: string): string {
  return hmacHex(`${orderId}|${paymentId}`, secret);
}

export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  return safeEqualHex(signCheckout(orderId, paymentId, secret), signature);
}

// Webhook signature: HMAC-SHA256 of the raw request body, keyed with the
// webhook secret. Must be checked before the body is parsed.
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  return safeEqualHex(hmacHex(rawBody, secret), signature);
}

function basicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function createOrder(
  amountPaise: number,
  notes: Record<string, string>,
  keyId: string,
  keySecret: string,
): Promise<{ id: string }> {
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: basicAuth(keyId, keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: randomUUID(), notes }),
  });
  if (!res.ok) throw new Error(`razorpay order create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export async function fetchPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<{ status: string; order_id: string; amount: number; currency: string }> {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: basicAuth(keyId, keySecret) },
  });
  if (!res.ok) throw new Error(`razorpay payment fetch failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { status: string; order_id: string; amount: number; currency: string };
}

// API keys from the server env, or null when payments are not configured.
export function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}
