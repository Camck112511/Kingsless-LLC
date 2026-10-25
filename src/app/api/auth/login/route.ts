import { NextResponse } from "next/server";
import { readAdminConfig } from "@/server/admin-config";
import { clearLoginFailures, clientIp, createSessionCookie, loginAllowed, passwordMatches, recordLoginFailure } from "@/server/auth";
import { fail, noStore, readJson } from "@/server/http";
import { LoginRequestSchema } from "@/server/schemas";

/** PROTECTED (security). See AGENTS.project.md. */
export async function POST(request: Request) {
  const cfg = readAdminConfig();
  if (!cfg.ok) return fail(503, cfg.reason);

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) return fail(403, "Cross-origin request refused.");
  } catch {
    return fail(403, "Cross-origin request refused.");
  }

  const ip = clientIp(request);
  if (!loginAllowed(ip)) return fail(429, "Too many attempts. Wait 15 minutes and try again.");

  const body = await readJson(request, LoginRequestSchema, 4_000);
  if ("error" in body) return body.error;

  if (!passwordMatches(body.data.password)) {
    recordLoginFailure(ip);
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return fail(401, "Incorrect password.");
  }

  clearLoginFailures(ip);
  const cookie = await createSessionCookie();
  if (!cookie) return fail(503, "Admin is not configured.");
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
