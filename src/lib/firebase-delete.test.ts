import { beforeEach, describe, expect, it, vi } from "vitest";

// deleteCurrentUser (src/lib/firebase.ts) with the Firebase JS SDK and the
// Capacitor plugin mocked; no network.
const isNativePlatform = vi.fn(() => false);
const plugin = {
  deleteUser: vi.fn(async () => {}),
  getCurrentUser: vi.fn(async (): Promise<{ user: { uid: string } | null }> => ({ user: null })),
  signInWithGoogle: vi.fn(async () => ({ credential: { idToken: "id-token" } })),
  signOut: vi.fn(async () => {}),
};
const currentUser = { uid: "u1", email: "a@b.com", displayName: "A" };
const auth = { currentUser: currentUser as typeof currentUser | null };
const fb = {
  deleteUser: vi.fn(async () => {}),
  reauthenticateWithPopup: vi.fn(async () => ({ user: currentUser })),
  signInWithCredential: vi.fn(async () => ({ user: currentUser })),
};
const recentLogin = () => Object.assign(new Error("Firebase: Error (auth/requires-recent-login)."), { code: "auth/requires-recent-login" });

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: plugin }));
vi.mock("firebase/app", () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock("firebase/auth", () => ({
  deleteUser: (...a: unknown[]) => fb.deleteUser(...(a as [])),
  getAuth: () => auth,
  initializeAuth: () => auth,
  indexedDBLocalPersistence: {},
  getRedirectResult: vi.fn(),
  GoogleAuthProvider: class {
    static credential = (idToken: string) => ({ idToken });
  },
  onAuthStateChanged: vi.fn(),
  reauthenticateWithPopup: (...a: unknown[]) => fb.reauthenticateWithPopup(...(a as [])),
  signInWithCredential: (...a: unknown[]) => fb.signInWithCredential(...(a as [])),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(async () => {}),
}));
vi.mock("./stored-user", () => ({ clearStoredUser: vi.fn() }));

const load = async () => {
  vi.resetModules();
  return await import("./firebase");
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries({
    NEXT_PUBLIC_FIREBASE_API_KEY: "k",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "d",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
    NEXT_PUBLIC_FIREBASE_APP_ID: "a",
  })) vi.stubEnv(k, v);
  vi.stubGlobal("window", {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  isNativePlatform.mockReturnValue(false);
  auth.currentUser = currentUser;
  fb.deleteUser.mockReset().mockResolvedValue(undefined);
  plugin.getCurrentUser.mockReset().mockResolvedValue({ user: null });
});

describe("deleteCurrentUser on the web", () => {
  it("deletes the signed-in Firebase user", async () => {
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("deleted");
    expect(fb.deleteUser).toHaveBeenCalledWith(currentUser);
    expect(fb.reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it("signs in again once on requires-recent-login, then deletes", async () => {
    fb.deleteUser.mockRejectedValueOnce(recentLogin());
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("deleted");
    expect(fb.reauthenticateWithPopup).toHaveBeenCalledTimes(1);
    expect(fb.deleteUser).toHaveBeenCalledTimes(2);
  });

  it("gives up with kept when the retry fails too", async () => {
    fb.deleteUser.mockRejectedValue(recentLogin());
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("kept");
    expect(fb.deleteUser).toHaveBeenCalledTimes(2);
  });

  it("does not ask for a sign-in on other errors", async () => {
    fb.deleteUser.mockRejectedValue(Object.assign(new Error("offline"), { code: "auth/network-request-failed" }));
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("kept");
    expect(fb.reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it("returns kept when nobody is signed in", async () => {
    auth.currentUser = null;
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("kept");
    expect(fb.deleteUser).not.toHaveBeenCalled();
  });
});

describe("deleteCurrentUser on Android", () => {
  beforeEach(() => isNativePlatform.mockReturnValue(true));

  it("deletes through the plugin and confirms the native user is gone", async () => {
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("deleted");
    expect(plugin.deleteUser).toHaveBeenCalledTimes(1);
    expect(plugin.signInWithGoogle).not.toHaveBeenCalled();
    expect(fb.deleteUser).not.toHaveBeenCalled();
  });

  it("treats a still-signed-in user as a refusal: signs in with Google again and retries once", async () => {
    plugin.getCurrentUser.mockResolvedValueOnce({ user: { uid: "u1" } }).mockResolvedValueOnce({ user: null });
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("deleted");
    expect(plugin.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(plugin.deleteUser).toHaveBeenCalledTimes(2);
  });

  it("returns kept when the user is still there after the retry", async () => {
    plugin.getCurrentUser.mockResolvedValue({ user: { uid: "u1" } });
    const { deleteCurrentUser } = await load();
    expect(await deleteCurrentUser()).toBe("kept");
    expect(plugin.deleteUser).toHaveBeenCalledTimes(2);
  });
});
