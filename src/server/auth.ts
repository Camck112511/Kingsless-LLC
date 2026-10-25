import "server-only";
/**
 * Server-side admin authentication. Defense in depth: the proxy (src/proxy.ts) redirects visitors, but EVERY admin
 * page and EVERY /api/admin route also calls requireAdmin() / adminGuard() itself, so a proxy bypass cannot expose data.
 *
 * PROTECTED (security). See AGENTS.project.md.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { readAdminConfig } from "./admin-config";
import { SESSION_TTL_SECONDS, signSession, verifySession } from "./session";

export const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-kl_admin" : "kl_admin";

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Constant-time password check (hashes first so lengths never leak). */
export function passwordMatches(input: string): boolean {
  const cfg = readAdminConfig();
  if (!cfg.ok) return false;
  return timingSafeEqual(sha256(input), sha256(cfg.password));
}

export async function createSessionCookie(): Promise<{ name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] } | null> {
  const cfg = readAdminConfig();
  if (!cfg.ok) return null;
  return {
    name: COOKIE_NAME,
    value: await signSession(cfg.secret),
    options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

function cookieFromHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) return v.join("=");
  }
  return undefined;
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const cfg = readAdminConfig();
  if (!cfg.ok) return false;
  return verifySession(cookieFromHeader(request.headers.get("cookie")), cfg.secret);
}

/** For server components / pages: redirects to the login page unless a valid admin session exists. */
export async function requireAdmin(): Promise<void> {
  const cfg = readAdminConfig();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cfg.ok || !(await verifySession(token, cfg.secret))) redirect("/admin/login");
}

const json = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * For /api/admin route handlers. Returns a Response to send back if the caller must be refused, else null.
 * State-changing calls must also come from this site's own origin and carry JSON.
 */
export async function adminGuard(request: Request): Promise<NextResponse | null> {
  const cfg = readAdminConfig();
  if (!cfg.ok) return json(503, cfg.reason);
  if (!(await isAdminRequest(request))) return json(401, "Not signed in.");
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return json(403, "Cross-origin request refused.");
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return json(415, "Expected application/json.");
    }
  }
  return null;
}

/* ------------------------- login throttling (best effort) ------------------------- */

const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

/** In-memory and per server instance, so it slows guessing but is not a guarantee. The long password is the real defense. */
export function loginAllowed(ip: string, now = Date.now()): boolean {
  const rec = attempts.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) return true;
  return rec.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const rec = attempts.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) attempts.set(ip, { count: 1, windowStart: now });
  else rec.count += 1;
  if (attempts.size > 5000) attempts.clear();
}

export function clearLoginFailures(ip: string): void {
  attempts.delete(ip);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
