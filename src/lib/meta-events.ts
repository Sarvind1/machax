import { Capacitor } from "@capacitor/core";
import { FacebookAnalytics, FacebookEventName, FacebookEventParameterName } from "@capgo/capacitor-facebook-analytics";

// Meta App Events for ad attribution. Installs and app opens are auto-logged by the
// native SDK (see AndroidManifest meta-data); this only covers events the web layer knows about.
// Native app only: the plugin has no web implementation.
export function logCompleteRegistration(): void {
  if (!Capacitor.isNativePlatform()) return;
  FacebookAnalytics.logEvent({
    event: FacebookEventName.CompletedRegistration,
    params: { [FacebookEventParameterName.RegistrationMethod]: "email" },
  }).catch(() => {});
}
