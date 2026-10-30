import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const mutation = vi.fn();
vi.mock("@/lib/convex-server", () => ({ getConvexAdmin: () => ({ mutation }) }));

import { POST } from "./route";

const GID = "11111111-2222-3333-4444-555555555555";
const post = (body: unknown, origin = "https://machax.xyz") =>
  POST(new Request("http://x/api/guest/wall", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  mutation.mockReset().mockResolvedValue({ recorded: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/guest/wall", () => {
  it("records a wall the app showed by itself", async () => {
    const res = await post({ guestId: GID, reason: "typed_limit", typedUsed: 3, totalUsed: 4, conversationId: "j97abc" });
    expect(res.status).toBe(204);
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("chatLog:recordSignInWall");
    expect(mutation.mock.calls[0][1]).toEqual({
      guestKey: `g:${GID}`, source: "client", reason: "typed_limit", typedUsed: 3, totalUsed: 4, conversationId: "j97abc", platform: "web",
    });
  });

  it("rejects a missing or malformed guest id and drops junk fields", async () => {
    expect((await post({ guestId: "short" })).status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
    await post({ guestId: GID, reason: "<script>", typedUsed: -1, conversationId: "../x" }, "http://localhost");
    expect(mutation.mock.calls[0][1]).toEqual({ guestKey: `g:${GID}`, source: "client", reason: "unknown", platform: "app" });
  });
});
