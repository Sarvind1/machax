import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreditSummary } from "./credits";

const isNativePlatform = vi.fn(() => true);
const Purchases = {
  isConfigured: vi.fn(async () => ({ isConfigured: false })),
  configure: vi.fn(async () => {}),
  logIn: vi.fn(async () => ({})),
  getProducts: vi.fn(async () => ({ products: [{ identifier: "topup_219", productCategory: "NON_SUBSCRIPTION" }] })),
  purchaseStoreProduct: vi.fn(async () => ({})),
};

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases,
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION", SUBSCRIPTION: "SUBSCRIPTION" },
}));

// Fresh module state (configured uid, warnings) per test.
const load = async () => {
  vi.resetModules();
  return await import("./purchases-native");
};

const summary = (balanceMicros: number): CreditSummary => ({
  balanceMicros,
  messagesLeft: Math.floor(balanceMicros / 150_000),
  topupMessages: 13,
  avgCostMicros: 150_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  Purchases.isConfigured.mockResolvedValue({ isConfigured: false });
  vi.stubEnv("NEXT_PUBLIC_REVENUECAT_ANDROID_KEY", "goog_test_key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("configurePurchases", () => {
  it("configures RevenueCat with the Firebase uid as appUserID", async () => {
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: "goog_test_key", appUserID: "u1" });
  });

  it("configures once for the same uid", async () => {
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    await configurePurchases("u1");
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it("logs in when the uid changes", async () => {
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    await configurePurchases("u2");
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "u2" });
  });

  it("logs in instead of configuring when the native SDK is already configured", async () => {
    Purchases.isConfigured.mockResolvedValue({ isConfigured: true });
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.logIn).toHaveBeenCalledWith({ appUserID: "u1" });
  });

  it("does nothing on the web", async () => {
    isNativePlatform.mockReturnValue(false);
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    expect(Purchases.isConfigured).not.toHaveBeenCalled();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it("does nothing and warns once when the key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_REVENUECAT_ANDROID_KEY", "");
    const { configurePurchases } = await load();
    await configurePurchases("u1");
    await configurePurchases("u1");
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the SDK fails", async () => {
    Purchases.configure.mockRejectedValueOnce(new Error("boom"));
    const { configurePurchases } = await load();
    await expect(configurePurchases("u1")).resolves.toBeUndefined();
  });
});

describe("buyTopupNative", () => {
  it("buys topup_219 as a one-time product", async () => {
    const { configurePurchases, buyTopupNative } = await load();
    await configurePurchases("u1");
    await expect(buyTopupNative()).resolves.toEqual({ started: true });
    expect(Purchases.getProducts).toHaveBeenCalledWith({
      productIdentifiers: ["topup_219"],
      type: "NON_SUBSCRIPTION",
    });
    expect(Purchases.purchaseStoreProduct).toHaveBeenCalledWith({
      product: { identifier: "topup_219", productCategory: "NON_SUBSCRIPTION" },
    });
  });

  it("throws code cancelled when the user backs out", async () => {
    Purchases.purchaseStoreProduct.mockRejectedValueOnce(
      Object.assign(new Error("Purchase was cancelled."), { code: "1", userCancelled: true }),
    );
    const { configurePurchases, buyTopupNative } = await load();
    await configurePurchases("u1");
    await expect(buyTopupNative()).rejects.toMatchObject({ code: "cancelled" });
  });

  it("throws a lowercase message for other failures", async () => {
    Purchases.purchaseStoreProduct.mockRejectedValueOnce(
      Object.assign(new Error("There was a problem with the store."), { code: "2", userCancelled: false }),
    );
    const { configurePurchases, buyTopupNative } = await load();
    await configurePurchases("u1");
    const err = (await buyTopupNative().catch((e: unknown) => e)) as Error & { code: string };
    expect(err).toMatchObject({ code: "failed" });
    expect(err.message).toBe(err.message.toLowerCase());
  });

  it("says so when the product is not in the store", async () => {
    Purchases.getProducts.mockResolvedValueOnce({ products: [] });
    const { configurePurchases, buyTopupNative } = await load();
    await configurePurchases("u1");
    await expect(buyTopupNative()).rejects.toMatchObject({ code: "unavailable" });
    expect(Purchases.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it("refuses to buy before RevenueCat is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_REVENUECAT_ANDROID_KEY", "");
    const { configurePurchases, buyTopupNative } = await load();
    await configurePurchases("u1");
    await expect(buyTopupNative()).rejects.toMatchObject({ code: "unavailable" });
    expect(Purchases.getProducts).not.toHaveBeenCalled();
  });
});

describe("waitForCredit", () => {
  it("returns the summary once the balance rises", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi
      .fn()
      .mockResolvedValueOnce(summary(500_000))
      .mockResolvedValueOnce(summary(2_500_000));
    const p = waitForCredit(500_000, fetchCredits);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(p).resolves.toEqual(summary(2_500_000));
    expect(fetchCredits).toHaveBeenCalledTimes(2);
  });

  it("polls every 2 s", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi.fn().mockResolvedValue(summary(0));
    void waitForCredit(0, fetchCredits);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchCredits).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchCredits).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchCredits).toHaveBeenCalledTimes(2);
  });

  it("keeps polling through fetch errors", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(summary(2_000_000));
    const p = waitForCredit(0, fetchCredits);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(p).resolves.toEqual(summary(2_000_000));
  });

  it("returns null after 20 s without a rise", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi.fn().mockResolvedValue(summary(1_000_000));
    const p = waitForCredit(1_000_000, fetchCredits);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(p).resolves.toBeNull();
    expect(fetchCredits).toHaveBeenCalledTimes(10);
  });

  it("returns null without fetching when the signal is already aborted", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi.fn().mockResolvedValue(summary(9_000_000));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(waitForCredit(0, fetchCredits, 20_000, ctrl.signal)).resolves.toBeNull();
    expect(fetchCredits).not.toHaveBeenCalled();
  });

  it("stops at once when aborted mid-wait, with no further fetches", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const fetchCredits = vi.fn().mockResolvedValue(summary(0));
    const ctrl = new AbortController();
    const p = waitForCredit(0, fetchCredits, 20_000, ctrl.signal);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchCredits).toHaveBeenCalledTimes(1);
    ctrl.abort();
    await expect(p).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchCredits).toHaveBeenCalledTimes(1);
  });

  it("returns null when aborted while a fetch is in flight, even if it shows the credit", async () => {
    vi.useFakeTimers();
    const { waitForCredit } = await load();
    const ctrl = new AbortController();
    const fetchCredits = vi.fn(async () => {
      ctrl.abort();
      return summary(9_000_000);
    });
    const p = waitForCredit(0, fetchCredits, 20_000, ctrl.signal);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toBeNull();
  });
});
