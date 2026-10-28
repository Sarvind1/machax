import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
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
