import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  deleteUser as firebaseDeleteUser,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import { clearStoredUser } from "./stored-user";

// Client-only. Firebase Auth, Google only. On both web and the Android app the Firebase JS
// SDK holds the signed-in user, so getIdToken() works the same everywhere.
// Native sign-in goes through the Capacitor plugin and is then mirrored into
// the JS SDK with the Google credential.

export type AuthedUserClient = { uid: string; email?: string; name?: string };

// NEXT_PUBLIC_* values are inlined at build time, so each must be read by its
// literal name (no dynamic process.env[key]).
const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const ENV_NAMES: Record<keyof typeof CONFIG, string> = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

let authInstance: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  const missing = (Object.keys(CONFIG) as (keyof typeof CONFIG)[])
    .filter((k) => !CONFIG[k])
    .map((k) => ENV_NAMES[k]);
  if (missing.length > 0) {
    throw new Error(`[firebase] missing web config: ${missing.join(", ")} (set them in .env.local / Vercel)`);
  }
  return getApps()[0] ?? initializeApp(CONFIG);
}

// Created on first use, in the browser only, so importing this module during
// prerender or with missing env never throws.
export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("[firebase] getFirebaseAuth() is browser-only");
  }
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  // In the Capacitor WebView the default getAuth() pulls in the popup/redirect
  // resolver (gapi iframes), which does not work there. Native sign-in never
  // needs it, so use plain IndexedDB persistence.
  authInstance = Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app);
  return authInstance;
}

function toClientUser(u: User): AuthedUserClient {
  return { uid: u.uid, email: u.email ?? undefined, name: u.displayName ?? undefined };
}

function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

export async function signInWithGoogle(): Promise<AuthedUserClient> {
  const auth = getFirebaseAuth();

  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error("[firebase] native Google sign-in returned no idToken");
    const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return toClientUser(cred.user);
  }

  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    return toClientUser(cred.user);
  } catch (err) {
    if (errorCode(err) !== "auth/popup-blocked") throw err;
    // The page navigates to Google and comes back to /login, where
    // completeRedirectSignIn() picks up the result. Nothing to return here.
    await signInWithRedirect(auth, provider);
    return new Promise<AuthedUserClient>(() => {});
  }
}

// Finishes a web redirect sign-in after Google sends the user back. Returns
// null when no redirect was in progress (and always on native).
export async function completeRedirectSignIn(): Promise<AuthedUserClient | null> {
  if (Capacitor.isNativePlatform()) return null;
  const result = await getRedirectResult(getFirebaseAuth());
  return result ? toClientUser(result.user) : null;
}

export async function getIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  // currentUser is null until persistence has been read on page load.
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export function onAuthChange(cb: (u: AuthedUserClient | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (u) => cb(u ? toClientUser(u) : null));
}

// Signs out of Firebase (and the native layer on Android) and drops the cached
// app user, so nothing keeps looking logged in.
export async function signOut(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut().catch(() => {});
  }
  clearStoredUser();
  await firebaseSignOut(getFirebaseAuth());
}

// "kept": Firebase still has the Google sign-in record (the caller tells the user).
export type DeleteCurrentUserResult = "deleted" | "kept";

const RECENT_LOGIN = "auth/requires-recent-login";

// The Android plugin's deleteUser() resolves even when Firebase refuses the
// delete (it ignores the task result), so read the outcome back: a deleted user
// is also signed out natively. Any refusal is treated as "sign in again first".
async function deleteNativeUserOnce(): Promise<void> {
  await FirebaseAuthentication.deleteUser();
  const { user } = await FirebaseAuthentication.getCurrentUser();
  if (user) {
    throw Object.assign(new Error("[firebase] native user still signed in after delete"), { code: RECENT_LOGIN });
  }
}

async function deleteWebUserOnce(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("[firebase] no signed-in user to delete");
  await firebaseDeleteUser(user);
}

// Deletes the Firebase Auth user (the Google sign-in record) after the app data
// is gone. Firebase refuses when the last sign-in is old, so on that error the
// user signs in with Google once more and the delete is retried once.
// Never throws; signing out stays the caller's job.
export async function deleteCurrentUser(): Promise<DeleteCurrentUserResult> {
  const native = Capacitor.isNativePlatform();
  const once = native ? deleteNativeUserOnce : deleteWebUserOnce;
  try {
    await once();
    return "deleted";
  } catch (err) {
    if (errorCode(err) !== RECENT_LOGIN) {
      console.error("[firebase] delete user failed:", err);
      return "kept";
    }
  }
  try {
    if (native) {
      await signInWithGoogle();
    } else {
      // Same Google popup as sign-in, as a re-auth. No redirect fallback: a
      // redirect would leave this page in the middle of the delete.
      const user = getFirebaseAuth().currentUser;
      if (!user) return "kept";
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
    await once();
    return "deleted";
  } catch (err) {
    console.error("[firebase] delete user failed after signing in again:", err);
    return "kept";
  }
}
