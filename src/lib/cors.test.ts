import { describe, expect, it } from "vitest";
import { corsHeaders, handleCorsOptions } from "./cors";

const allowOrigin = (origin?: string) => {
  const headers = origin ? { origin } : undefined;
  const h = corsHeaders(new Request("http://localhost/api/x", { headers })) as Record<string, string>;
  return h["Access-Control-Allow-Origin"];
};

describe("corsHeaders", () => {
  it.each(["http://localhost", "https://localhost", "capacitor://localhost"])("allows the app origin %s", (origin) => {
    expect(allowOrigin(origin)).toBe(origin);
  });

  it.each([
    "http://localhost.evil.com",
    "https://localhost.evil.com",
    "capacitor://localhost.evil",
    "http://localhost:3000",
    "https://evil.com",
    "",
  ])("refuses the look-alike or foreign origin %j", (origin) => {
    expect(allowOrigin(origin)).toBe("");
  });

  it("refuses a request with no origin", () => {
    expect(allowOrigin()).toBe("");
  });
});

describe("handleCorsOptions", () => {
  it("answers OPTIONS with 204 and the CORS headers, and ignores other methods", () => {
    const res = handleCorsOptions(new Request("http://localhost/api/x", { method: "OPTIONS", headers: { origin: "capacitor://localhost" } }));
    expect(res?.status).toBe(204);
    expect(res?.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(handleCorsOptions(new Request("http://localhost/api/x", { method: "POST" }))).toBeNull();
  });
});
