/**
 * Signed admin session cookie. Pure Web Crypto, so it runs in the proxy and in route handlers alike.
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET)).
 *
 * PROTECTED (security). See AGENTS.project.md.
 */

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  sub: "admin";
  iat: number;
  exp: number;
}

const enc = new TextEncoder();

function toB64u(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSession(secret: string, nowMs: number = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { sub: "admin", iat, exp: iat + SESSION_TTL_SECONDS };
  const body = toB64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body)));
  return `${body}.${toB64u(sig)}`;
}

export async function verifySession(token: string | undefined | null, secret: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length > 0) return false;
  const sigBytes = fromB64u(sig);
  if (!sigBytes) return false;
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sigBytes, enc.encode(body));
  if (!valid) return false;
  const payloadBytes = fromB64u(body);
  if (!payloadBytes) return false;
  try {
    const p = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    const now = Math.floor(nowMs / 1000);
    return p.sub === "admin" && typeof p.exp === "number" && typeof p.iat === "number" && p.exp > now && p.iat <= now + 60;
  } catch {
    return false;
  }
}
