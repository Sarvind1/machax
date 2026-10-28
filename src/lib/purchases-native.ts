import { Capacitor } from "@capacitor/core";
import { TOPUP_PRODUCT_ID, type CreditSummary } from "./credits";

// Android half of the top-up: Google Play Billing through RevenueCat. The
// purchase itself grants nothing here: RevenueCat's webhook tells our server,
// the server grants credit, and the app polls /api/credits until it shows.
// Every export is a no-op or a refusal on the web.

// cancelled: the user backed out (close silently). unavailable: payments not
// set up or the product is missing. failed: anything else.
export type NativePurchaseErrorCode = "cancelled" | "unavailable" | "failed";

// Message is safe to show the user as is.
export class NativePurchaseError extends Error {
  constructor(
    readonly code: NativePurchaseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NativePurchaseError";
  }
}

const LOG = "[purchases-native]";
const POLL_MS = 2_000;

// Loaded on demand so the web bundle never pulls the plugin in.
const loadPlugin = () => import("@revenuecat/purchases-capacitor");

let configuredUid: string | null = null;
let setup: Promise<void> | null = null;
let warnedNoKey = false;

// Points RevenueCat at this Firebase uid: configure the first time, logIn when
// the uid changes. Never throws; failures are logged and the next call retries.
export async function configurePurchases(uid: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Read by its literal name: NEXT_PUBLIC_* is inlined at build time.
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) {
    if (!warnedNoKey) console.warn(LOG, "NEXT_PUBLIC_REVENUECAT_ANDROID_KEY not set: Play purchases are off");
    warnedNoKey = true;
    return;
  }

  // Chained so overlapping calls run in order and the last uid wins.
  const run = (setup ?? Promise.resolve()).then(async () => {
    if (configuredUid === uid) return;
    const { Purchases } = await loadPlugin();
    // The native SDK outlives a WebView reload, which resets this module.
    const isConfigured = configuredUid !== null || (await Purchases.isConfigured()).isConfigured;
    if (isConfigured) await Purchases.logIn({ appUserID: uid });
    else await Purchases.configure({ apiKey, appUserID: uid });
    configuredUid = uid;
  });
  setup = run.catch(() => {});
  try {
    await run;
  } catch (err) {
    console.error(LOG, "configure failed:", err);
  }
}

function isUserCancel(err: unknown): boolean {
  if (typeof err !== "object" || !err) return false;
  const e = err as { userCancelled?: unknown; code?: unknown };
  // "1" is PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR.
  return e.userCancelled === true || e.code === "1";
}

// Opens the Play purchase sheet for topup_219. Resolves once Play has the
// payment; credit lands separately (see waitForCredit). If setup failed earlier
// (e.g. offline at launch), it is retried once for uid before giving up.
export async function buyTopupNative(uid?: string): Promise<{ started: true }> {
  if (!Capacitor.isNativePlatform()) {
    throw new NativePurchaseError("unavailable", "play payments only work in the app");
  }
  await setup;
  if (!configuredUid && uid) await configurePurchases(uid);
  if (!configuredUid) {
    throw new NativePurchaseError("unavailable", "payments aren't ready, try again in a bit");
  }

  try {
    const { Purchases, PRODUCT_CATEGORY } = await loadPlugin();
    // One-time products have to be asked for by category: the default is subscriptions.
    const { products } = await Purchases.getProducts({
      productIdentifiers: [TOPUP_PRODUCT_ID],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    const product = products.find((p) => p.identifier === TOPUP_PRODUCT_ID);
    if (!product) throw new NativePurchaseError("unavailable", "top up isn't available right now");
    await Purchases.purchaseStoreProduct({ product });
    return { started: true };
  } catch (err) {
    if (err instanceof NativePurchaseError) throw err;
    if (isUserCancel(err)) throw new NativePurchaseError("cancelled", "payment cancelled");
    console.error(LOG, "purchase failed:", err);
    throw new NativePurchaseError("failed", "payment didn't go through");
  }
}

// Resolves after ms, or as soon as the signal aborts.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

// Polls every 2 s until the balance is above prev. Fetch errors are skipped.
// Returns null when timeoutMs passes without a rise, or once signal aborts
// (no fetches after that).
export async function waitForCredit(
  prev: number,
  fetchCredits: () => Promise<CreditSummary>,
  timeoutMs = 20_000,
  signal?: AbortSignal,
): Promise<CreditSummary | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    await sleep(POLL_MS, signal);
    if (signal?.aborted) break;
    try {
      const credits = await fetchCredits();
      if (signal?.aborted) break;
      if (credits.balanceMicros > prev) return credits;
    } catch {
      // offline or a blip: try again next tick
    }
  }
  return null;
}
