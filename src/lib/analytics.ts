import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-firebase/analytics";

// Firebase Analytics (GA4) for app usage. first_open and session_start are auto-logged by the
// native SDK; screen_view is logged per Next route (automatic Activity screen reporting is off
// in AndroidManifest, since the whole app is one Activity).
// Native app only: the web site doesn't ship the Firebase JS SDK config.
const enabled = () => Capacitor.isNativePlatform();

type Params = Record<string, string | number>;

export function logEvent(name: string, params?: Params): void {
  if (!enabled()) return;
  FirebaseAnalytics.logEvent({ name, params }).catch(() => {});
}

export function logScreen(pathname: string): void {
  if (!enabled()) return;
  FirebaseAnalytics.setCurrentScreen({ screenName: pathname, screenClassOverride: pathname }).catch(() => {});
}

// user_id is a SHA-256 of the username, so GA never receives the handle itself.
export async function setAnalyticsUser(username: string | null): Promise<void> {
  if (!enabled()) return;
  try {
    if (!username) {
      await FirebaseAnalytics.setUserId({ userId: null });
      return;
    }
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(username.toLowerCase()));
    const userId = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
    await FirebaseAnalytics.setUserId({ userId });
  } catch {}
}
