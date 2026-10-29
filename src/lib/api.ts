import { API_BASE } from "./api-base";
import { getIdToken } from "./firebase";
import { setStoredUser } from "./stored-user";
import type { CreditSummary } from "./credits";

export { getStoredUser, type StoredUser } from "./stored-user";

// Client-side fetch for our own /api/* routes, carrying the Firebase ID token.

export class AuthRequired extends Error {
  constructor() {
    super("auth required");
    this.name = "AuthRequired";
  }
}

export type SessionResult = {
  uid: string;
  username: string;
  name?: string;
  credits: CreditSummary;
  // Present when a guest id was sent: how many guest chats moved to this account.
  guestClaim?: { moved: number; activated: boolean };
};

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new AuthRequired();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

// For a signed-out user: no token, so the server treats it as a guest.
export async function guestFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, init);
}

// Call right after sign-in: creates or links the app user on the server and
// caches { username, name, uid } in localStorage["machax-user"] for the UI.
// guestId moves this device's guest chats to the account.
// A 401 means the server rejected the token: throws AuthRequired.
export async function bootstrapSession(guestId?: string | null): Promise<SessionResult> {
  const res = await authedFetch("/api/auth/session", {
    method: "POST",
    ...(guestId
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId }) }
      : {}),
  });
  if (res.status === 401) throw new AuthRequired();
  if (!res.ok) throw new Error(`session bootstrap failed: ${res.status}`);
  const body = (await res.json()) as SessionResult;
  setStoredUser({ username: body.username, name: body.name ?? body.username, uid: body.uid });
  return body;
}
