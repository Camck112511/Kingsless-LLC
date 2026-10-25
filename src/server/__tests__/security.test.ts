import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "../admin-config";
import { signSession, verifySession } from "../session";

const SECRET = "x".repeat(40);

describe("session cookie", () => {
  it("accepts a freshly signed token", async () => {
    expect(await verifySession(await signSession(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    expect(await verifySession(await signSession("y".repeat(40)), SECRET)).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(SECRET);
    const [body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ sub: "admin", iat: 1, exp: 9_999_999_999 })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`, SECRET)).toBe(false);
    expect(await verifySession(`${body}.AAAA`, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(SECRET, Date.now() - 13 * 3600 * 1000);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("rejects garbage, empty and oversized tokens", async () => {
    for (const t of [undefined, "", "abc", "a.b.c", "a".repeat(5000)]) expect(await verifySession(t, SECRET)).toBe(false);
  });
});

describe("admin config fails closed", () => {
  it("is disabled with no credentials", () => {
    expect(readAdminConfig({}).ok).toBe(false);
  });
  it("is disabled with a short password or short secret", () => {
    expect(readAdminConfig({ ADMIN_PASSWORD: "short", AUTH_SECRET: SECRET }).ok).toBe(false);
    expect(readAdminConfig({ ADMIN_PASSWORD: "a-long-enough-password", AUTH_SECRET: "short" }).ok).toBe(false);
  });
  it("is enabled with proper credentials", () => {
    expect(readAdminConfig({ ADMIN_PASSWORD: "a-long-enough-password", AUTH_SECRET: SECRET }).ok).toBe(true);
  });
  it("rejects the committed development credentials in production", () => {
    const dev = { ADMIN_PASSWORD: "dev-only-admin-password", AUTH_SECRET: "dev-only-auth-secret-not-for-production-0123456789abcdef" };
    expect(readAdminConfig({ ...dev, NODE_ENV: "development" }).ok).toBe(true);
    expect(readAdminConfig({ ...dev, NODE_ENV: "production" }).ok).toBe(false);
  });
});

describe("admin API routes", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-enough-password");
    vi.stubEnv("AUTH_SECRET", SECRET);
    vi.stubEnv("NODE_ENV", "test");
  });
  afterEach(() => vi.unstubAllEnvs());

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", ...headers },
      body: JSON.stringify(body),
    });

  const routes = async () => ({
    pricing: (await import("@/app/api/admin/pricing/route")).POST,
    analyze: (await import("@/app/api/admin/analyze/route")).POST,
    extract: (await import("@/app/api/admin/extract/route")).POST,
    discover: (await import("@/app/api/admin/discover/route")).POST,
  });

  it("every admin route refuses a request with no session", async () => {
    const r = await routes();
    for (const [name, handler] of Object.entries(r)) {
      const res = await handler(post(`/api/admin/${name}`, {}));
      expect(res.status, name).toBe(401);
    }
  });

  it("refuses a forged cookie", async () => {
    const { pricing } = await routes();
    const res = await pricing(post("/api/admin/pricing", { contractValueUsd: 1, subPriceUsd: 1, otherCostsUsd: 0 }, { cookie: "kl_admin=forged.token" }));
    expect(res.status).toBe(401);
  });

  it("refuses a valid session coming from another origin", async () => {
    const { pricing } = await routes();
    const cookie = `kl_admin=${await signSession(SECRET)}`;
    const res = await pricing(post("/api/admin/pricing", { contractValueUsd: 1, subPriceUsd: 1, otherCostsUsd: 0 }, { cookie, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("serves the owner's calculator to a signed-in admin", async () => {
    const { pricing } = await routes();
    const cookie = `kl_admin=${await signSession(SECRET)}`;
    const res = await pricing(post("/api/admin/pricing", { contractValueUsd: 10000, subPriceUsd: 5700, otherCostsUsd: 500 }, { cookie }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { pricing: { netMarginRate: number; subShareRate: number } };
    expect(json.pricing.netMarginRate).toBeCloseTo(0.38, 6);
    expect(json.pricing.subShareRate).toBeCloseTo(0.57, 6);
  });

  it("rejects malformed input instead of crashing", async () => {
    const { pricing } = await routes();
    const cookie = `kl_admin=${await signSession(SECRET)}`;
    const res = await pricing(post("/api/admin/pricing", { contractValueUsd: -5, subPriceUsd: "x" }, { cookie }));
    expect(res.status).toBe(400);
  });

  it("is disabled entirely when the admin is not configured", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const { pricing } = await routes();
    const res = await pricing(post("/api/admin/pricing", {}, { cookie: `kl_admin=${await signSession(SECRET)}` }));
    expect(res.status).toBe(503);
  });

  it("login: wrong password is refused, right password sets an httpOnly strict cookie", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const bad = await POST(post("/api/auth/login", { password: "nope-nope-nope-nope" }));
    expect(bad.status).toBe(401);
    const good = await POST(post("/api/auth/login", { password: "a-long-enough-password" }, { "x-forwarded-for": "9.9.9.9" }));
    expect(good.status).toBe(200);
    const set = good.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/kl_admin=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=strict/i);
  }, 10_000);

  it("login: refuses cross-origin attempts", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(post("/api/auth/login", { password: "a-long-enough-password" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("extract returns rule-based terms with evidence", async () => {
    const { extract } = await routes();
    const cookie = `kl_admin=${await signSession(SECRET)}`;
    const res = await extract(post("/api/admin/extract", { text: "Intermediaries are not permitted. Payment within 30 days of receipt of invoice." }, { cookie }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { terms: { subcontracting: string; paymentNetDays: number } };
    expect(json.terms.subcontracting).toBe("prohibited");
    expect(json.terms.paymentNetDays).toBe(30);
  });

  it("analyze runs the engine on a posted pipeline", async () => {
    const { analyze } = await routes();
    const { TEST_CASE_OPPORTUNITIES } = await import("@/engine");
    const { DEFAULT_SETTINGS, DEFAULT_INPUTS } = await import("@/engine/config");
    const cookie = `kl_admin=${await signSession(SECRET)}`;
    const res = await analyze(
      post("/api/admin/analyze", {
        settings: DEFAULT_SETTINGS,
        subcontractors: [],
        quotes: [],
        today: "2026-10-25",
        withScripts: true,
        items: TEST_CASE_OPPORTUNITIES.map((opportunity) => ({ opportunity, inputs: DEFAULT_INPUTS })),
      }, { cookie }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { analyses: Array<{ opportunityId: string; verdict: string }>; scripts: Record<string, { status: string }> };
    const verdicts = Object.fromEntries(json.analyses.map((a) => [a.opportunityId, a.verdict]));
    expect(verdicts).toEqual({ "fw-26-0268": "reject", "lamp-rfp-0003": "investigate", "lamp-rfp-0005": "investigate" });
    expect(json.scripts["fw-26-0268"]?.status).toBe("withheld");
    // ranked: investigate before reject
    expect(json.analyses.at(-1)?.opportunityId).toBe("fw-26-0268");
  });
});
