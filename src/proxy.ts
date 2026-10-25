/**
 * Gatekeeper for the admin area. Visitors without a valid signed session are redirected (pages) or refused (API).
 * This is a convenience layer, not the only one: every admin page and API route re-checks the session itself.
 *
 * PROTECTED (security). See AGENTS.project.md.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig } from "@/server/admin-config";
import { verifySession } from "@/server/session";

const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-kl_admin" : "kl_admin";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/admin");
  const isLogin = pathname === "/admin/login";

  const cfg = readAdminConfig();
  const signedIn = cfg.ok && (await verifySession(request.cookies.get(COOKIE_NAME)?.value, cfg.secret));

  let response: NextResponse;
  if (isLogin) {
    response = signedIn ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  } else if (!signedIn) {
    response = isApi
      ? NextResponse.json({ error: cfg.ok ? "Not signed in." : cfg.reason }, { status: cfg.ok ? 401 : 503 })
      : NextResponse.redirect(new URL("/admin/login", request.url));
  } else {
    response = NextResponse.next();
  }

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
