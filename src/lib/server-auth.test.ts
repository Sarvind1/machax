import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, type JWTVerifyGetKey, type CryptoKey } from "jose";
import { requireUser, authErrorResponse, AuthError } from "./server-auth";

const PROJECT = "machax-b8796";
const ISSUER = `https://securetoken.google.com/${PROJECT}`;

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwks = async () => pair.publicKey;
});

function req(authorization?: string, origin?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  if (origin) headers.origin = origin;
  return new Request("http://localhost/api/test", { headers });
}

async function sign(
  overrides: { iss?: string; aud?: string; exp?: number | string } = {},
): Promise<string> {
  return new SignJWT({ email: "a@b.com", name: "Alice" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("uid1")
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? PROJECT)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "1h")
    .sign(privateKey);
}

describe("requireUser", () => {
  it("returns uid, email, name for a valid token", async () => {
    const token = await sign();
    const user = await requireUser(req(`Bearer ${token}`), { jwks });
    expect(user).toEqual({ uid: "uid1", email: "a@b.com", name: "Alice" });
  });

  it("rejects a wrong audience", async () => {
    const token = await sign({ aud: "other-project" });
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a wrong issuer", async () => {
    const token = await sign({ iss: "https://securetoken.google.com/other" });
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an expired token", async () => {
    const token = await sign({ exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a missing Authorization header", async () => {
    await expect(requireUser(req(), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a non-Bearer Authorization header", async () => {
    await expect(requireUser(req("Basic abc"), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects garbage in the bearer slot", async () => {
    await expect(requireUser(req("Bearer not-a-jwt"), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an alg:none token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      iss: ISSUER,
      aud: PROJECT,
      sub: "uid1",
      iat: now,
      exp: now + 3600,
    })}.`;
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an HS256 token", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("uid1")
      .setIssuer(ISSUER)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-shared-secret-of-sufficient-length-32b"));
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a token with no subject", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    await expect(requireUser(req(`Bearer ${token}`), { jwks })).rejects.toBeInstanceOf(AuthError);
  });
});

describe("authErrorResponse", () => {
  it("returns a 401 JSON response with CORS headers for AuthError", async () => {
    const res = authErrorResponse(new AuthError(), req(undefined, "http://localhost"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(await res!.json()).toEqual({ error: "unauthorized" });
    expect(res!.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(res!.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("returns null for other errors", () => {
    expect(authErrorResponse(new Error("boom"), req())).toBeNull();
  });
});
