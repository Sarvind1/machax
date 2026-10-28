import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrder,
  fetchPayment,
  signCheckout,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./razorpay";

const SECRET = "test_secret";

// Flip one hex digit so the signature keeps its length but no longer matches.
function flipByte(hex: string): string {
  const last = hex[hex.length - 1];
  return hex.slice(0, -1) + (last === "0" ? "1" : "0");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkout signature", () => {
  it("is the hex HMAC-SHA256 of `order|payment`", () => {
    const expected = createHmac("sha256", SECRET).update("order_1|pay_1").digest("hex");
    expect(signCheckout("order_1", "pay_1", SECRET)).toBe(expected);
  });

  it("round-trips with signCheckout", () => {
    const sig = signCheckout("order_1", "pay_1", SECRET);
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, SECRET)).toBe(true);
  });

  it("rejects a flipped byte, a wrong secret, another payment, and junk", () => {
    const sig = signCheckout("order_1", "pay_1", SECRET);
    expect(verifyCheckoutSignature("order_1", "pay_1", flipByte(sig), SECRET)).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "other")).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_2", sig, SECRET)).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", "abc", SECRET)).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", "", SECRET)).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "payment.captured" });
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");

  it("accepts the HMAC of the raw body", () => {
    expect(verifyWebhookSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a flipped byte, a changed body, and an empty secret", () => {
    expect(verifyWebhookSignature(body, flipByte(sig), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body + " ", sig, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });
});

describe("Razorpay API calls", () => {
  it("createOrder posts INR amount, notes and a receipt with basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "order_9" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrder(21_900, { uid: "u1" }, "key", "secret")).resolves.toEqual({ id: "order_9" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ amount: 21_900, currency: "INR", notes: { uid: "u1" } });
    expect(typeof sent.receipt).toBe("string");
  });

  it("createOrder throws on a non-2xx answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(createOrder(21_900, {}, "key", "secret")).rejects.toThrow(/401/);
  });

  it("fetchPayment gets the payment by id", async () => {
    const payment = { status: "captured", order_id: "order_9", amount: 21_900 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payment));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPayment("pay_1", "key", "secret")).resolves.toEqual(payment);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1");
  });
});
