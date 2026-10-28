import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { corsHeaders } from "./cors";

// Verifies Firebase ID tokens with Google's public keys. No firebase-admin,
// no service account: a token is checked locally against the published JWKS.
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type AuthedUser = { uid: string; email?: string; name?: string };

export class AuthError extends Error {
  readonly status = 401 as const;
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

let remoteJwks: JWTVerifyGetKey | undefined;
function defaultJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return remoteJwks;
}

export async function requireUser(
  request: Request,
  opts: { jwks?: JWTVerifyGetKey } = {},
): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) throw new AuthError("missing bearer token");

  const projectId = process.env.FIREBASE_PROJECT_ID || "machax-b8796";
  try {
    const { payload } = await jwtVerify(match[1], opts.jwks ?? defaultJwks(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub === "") {
      throw new AuthError("token has no subject");
    }
    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("invalid token");
  }
}

export function authErrorResponse(err: unknown, request: Request): Response | null {
  if (!(err instanceof AuthError)) return null;
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: corsHeaders(request) },
  );
}
