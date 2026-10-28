// The app user cached in localStorage["machax-user"] after a Firebase session
// bootstrap. Kept free of Firebase imports so light pages can read it cheaply.

export type StoredUser = { username: string; name?: string; uid: string };

const KEY = "machax-user";

// Only entries from a Firebase session (with a uid) count. Old password-login
// entries without a uid count as logged out.
export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.uid && parsed?.username ? (parsed as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
