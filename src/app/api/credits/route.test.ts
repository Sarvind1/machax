import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const requireUser = vi.fn();
const mutation = vi.fn();

vi.mock("@/lib/server-auth", async () => {
  class AuthError extends Error {
    readonly status = 401 as const;
  }
  return {
    AuthError,
    requireUser: (...a: unknown[]) => requireUser(...a),
    authErrorResponse: (err: unknown) =>
      err instanceof AuthError
        ? Response.json({ error: "unauthorized" }, { status: 401 })
        : null,
  };
});
vi.mock("@/lib/convex-server", () => ({
  getConvexAdmin: () => ({ mutation }),
}));

import { AuthError } from "@/lib/server-auth";
import { GET, OPTIONS } from "./route";

const req = () =>
  new Request("http://localhost/api/credits", {
    headers: { authorization: "Bearer x", origin: "http://localhost" },
  });

beforeEach(() => {
  requireUser.mockReset();
  mutation.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/credits", () => {
  it("returns 401 for an AuthError", async () => {
    requireUser.mockRejectedValue(new AuthError("missing bearer token"));
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("upserts the user, ensures credits, and returns the summary with CORS", async () => {
    requireUser.mockResolvedValue({ uid: "u1", email: "a@b.com", name: "Alice" });
    mutation.mockImplementation(async (ref: never, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === "users:upsertFromFirebase") {
        expect(args).toEqual({ uid: "u1", email: "a@b.com", name: "Alice" });
        return { username: "a", name: "Alice", created: true };
      }
      if (name === "credits:ensure") {
        expect(args).toEqual({ uid: "u1", username: "a" });
        return { balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 };
      }
      throw new Error(`unexpected ${name}`);
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toEqual({
      balanceMicros: 1_000_000,
      messagesLeft: 6,
      topupMessages: 13,
      avgCostMicros: 150_000,
    });
  });

  it("turns a non-AuthError from requireUser into a 500, not a 401", async () => {
    requireUser.mockRejectedValue(new Error("JWKS fetch timed out"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 500 when Convex fails", async () => {
    requireUser.mockResolvedValue({ uid: "u1" });
    mutation.mockRejectedValue(new Error("convex down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

describe("OPTIONS /api/credits", () => {
  it("answers preflight with CORS headers", async () => {
    const res = await OPTIONS(
      new Request("http://localhost/api/credits", {
        method: "OPTIONS",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
  });
});
