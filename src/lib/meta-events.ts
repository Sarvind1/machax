import { Capacitor } from "@capacitor/core";
import { FacebookAnalytics, FacebookEventName, FacebookEventParameterName } from "@capgo/capacitor-facebook-analytics";

// Meta App Events for ad attribution. Installs and app opens are auto-logged by the
// native SDK (see AndroidManifest meta-data); this only covers events the web layer knows about.
// Native app only: the plugin has no web implementation.
//
// Each event goes two ways with one shared event_id so Meta dedups them:
// server-side via Convex (/meta/event -> Conversions API), and on-device via the SDK.
// The server checks the event really happened and answers send:true only the first time,
// so both sides fire once per user.

const CONVEX_SITE_URL = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(".convex.cloud", ".convex.site");

type MetaEvent = "CompleteRegistration" | "Activated";

// Meta's 16-slot device info array for app events; unknown slots stay empty
async function extinfo(): Promise<string[]> {
  const ua = navigator.userAgent;
  let osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? "";
  let model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1] ?? "";
  const uaData = (navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ model?: string; platformVersion?: string }> };
  }).userAgentData;
  if (uaData) {
    try {
      const hints = await uaData.getHighEntropyValues(["model", "platformVersion"]);
      model = hints.model || model;
      osVersion = hints.platformVersion || osVersion;
    } catch {}
  }
  const dpr = window.devicePixelRatio || 1;
  const tzShort =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")
      ?.value ?? "";
  return [
    "a2",
    "xyz.machax.app",
    "",
    "",
    osVersion,
    model,
    navigator.language.replace("-", "_"),
    tzShort,
    "",
    String(Math.round(screen.width * dpr)),
    String(Math.round(screen.height * dpr)),
    dpr.toFixed(2),
    String(navigator.hardwareConcurrency || ""),
    "",
    "",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
}

async function track(eventName: MetaEvent, username: string, params: Record<string, string> = {}): Promise<void> {
  if (!Capacitor.isNativePlatform() || !CONVEX_SITE_URL || !username) return;
  const eventId = crypto.randomUUID();
  const { status } = await FacebookAnalytics.getAdvertiserTrackingStatus().catch(() => ({ status: true }));
  const res = await fetch(`${CONVEX_SITE_URL}/meta/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, eventId, username, advertiserTrackingEnabled: status, extinfo: await extinfo() }),
  });
  const { send } = (await res.json()) as { send?: boolean };
  if (!send) return;
  const sdkName = eventName === "CompleteRegistration" ? FacebookEventName.CompletedRegistration : eventName;
  await FacebookAnalytics.logEvent({ event: sdkName, params: { ...params, event_id: eventId } });
}

// Call right after a successful sign-in; the server only lets a fresh registration through.
export function logCompleteRegistration(username: string, method: string): void {
  track("CompleteRegistration", username, { [FacebookEventParameterName.RegistrationMethod]: method }).catch(() => {});
}

// Call after the user picks an option on a decision; only their first pick counts
export function logActivated(username: string): void {
  track("Activated", username).catch(() => {});
}
