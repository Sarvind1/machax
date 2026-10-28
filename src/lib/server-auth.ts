import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { corsHeaders } from "./cors";

// Verifies Firebase ID tokens with Google's public keys. No firebase-admin,
// no service account: a token is checked locally against the published JWKS.
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type AuthedUser = { uid: string; email?: string; name?: string; emailVerified: boolean };

// Only Google sign-in is enabled. Pinning it here means turning on anonymous or
// email/password sign-in in the Firebase console later cannot mint free $1
// accounts or unverified emails without a code change.
const ALLOWED_SIGN_IN_PROVIDER = "google.com";

export class AuthError extends Error {
  readonly status = 401 as const;
  constructor(message = "unauthorized", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthError";
  }
}

// Errors that mean "this token is bad". Anything else (JWKS timeout, network
// failure, invalid JWKS, misconfigured key) is a server-side problem and must
// not look like bad credentials, so it is rethrown for the route to return 5xx.
function isTokenError(err: unknown): boolean {
  return (
    err instanceof errors.JWTClaimValidationFailed ||
    err instanceof errors.JWTExpired ||
    err instanceof errors.JWSSignatureVerificationFailed ||
    err instanceof errors.JWSInvalid ||
    err instanceof errors.JWTInvalid ||
    err instanceof errors.JOSEAlgNotAllowed ||
    err instanceof errors.JOSENotSupported ||
    err instanceof errors.JWKSNoMatchingKey ||
    err instanceof errors.JWKSMultipleMatchingKeys
  );
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
    const firebase = payload.firebase as { sign_in_provider?: unknown } | undefined;
    if (firebase?.sign_in_provider !== ALLOWED_SIGN_IN_PROVIDER) {
      throw new AuthError("sign-in provider not allowed");
    }
    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      emailVerified: payload.email_verified === true,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (isTokenError(err)) throw new AuthError("invalid token", { cause: err });
    throw err;
  }
}

export function authErrorResponse(err: unknown, request: Request): Response | null {
  if (!(err instanceof AuthError)) return null;
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: corsHeaders(request) },
  );
}
