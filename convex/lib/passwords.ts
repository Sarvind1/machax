/**
 * Password hashing utilities using Web Crypto API (available in Convex runtime).
 *
 * Uses PBKDF2 with 100k iterations and a per-user random salt.
 * PBKDF2 is intentionally slow, making brute-force attacks impractical
 * (~100k× slower than single-pass SHA-256).
 */

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(
  password: string,
  salt: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
