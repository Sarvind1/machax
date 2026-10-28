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
import { OPTIONS, POST } from "./route";

const req = (headers: Record<string, string> = { authorization: "Bearer x" }) =>
  new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { origin: "http://localhost", ...headers },
  });

beforeEach(() => {
  requireUser.mockReset();
  mutation.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/account/delete", () => {
  it("returns 401 without a valid token and deletes nothing", async () => {
    requireUser.mockRejectedValue(new AuthError("missing bearer token"));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("deletes by the verified uid and returns 200 with CORS", async () => {
    requireUser.mockResolvedValue({ uid: "u1", email: "a@b.com" });
    mutation.mockResolvedValue({ deletedUser: true });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("users:deleteByUid");
    expect(mutation.mock.calls[0][1]).toEqual({ uid: "u1" });
  });

  it("returns 500 when Convex fails", async () => {
    requireUser.mockResolvedValue({ uid: "u1" });
    mutation.mockRejectedValue(new Error("convex down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("OPTIONS /api/account/delete", () => {
  it("answers preflight with CORS headers", async () => {
    const res = await OPTIONS(
      new Request("http://localhost/api/account/delete", {
        method: "OPTIONS",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
  });
});
