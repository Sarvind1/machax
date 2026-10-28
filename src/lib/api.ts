import { API_BASE } from "./api-base";
import { getIdToken } from "./firebase";
import type { CreditSummary } from "./credits";

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
};

export type StoredUser = { username: string; name?: string; uid: string };

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new AuthRequired();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

// Call right after sign-in: creates or links the app user on the server and
// caches { username, name, uid } in localStorage["machax-user"] for the UI.
export async function bootstrapSession(): Promise<SessionResult> {
  const res = await authedFetch("/api/auth/session", { method: "POST" });
  if (res.status === 401) throw new AuthRequired();
  if (!res.ok) throw new Error(`session bootstrap failed: ${res.status}`);
  const body = (await res.json()) as SessionResult;
  const stored: StoredUser = { username: body.username, name: body.name ?? body.username, uid: body.uid };
  localStorage.setItem("machax-user", JSON.stringify(stored));
  return body;
}

// The cached user, only if it came from a Firebase session (has a uid).
// Old password-login entries without a uid count as logged out.
export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem("machax-user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.uid && parsed?.username ? (parsed as StoredUser) : null;
  } catch {
    return null;
  }
}
