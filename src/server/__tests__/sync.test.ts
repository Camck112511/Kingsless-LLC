import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, emptyBid } from "@/engine/config";
import { cleanOpp, goodInputs, TODAY } from "@/engine/__tests__/helpers";
import type { AppState, Patch } from "@/lib/types";
import { signSession } from "../session";
import { getStore, resetMemoryStore } from "../store/state-store";

const SECRET = "x".repeat(40);
const state = (notes = ""): AppState => ({
  version: 1,
  settings: DEFAULT_SETTINGS,
  items: [{ opportunity: cleanOpp({ id: "a" }), inputs: goodInputs(), status: "new", notes, addedAt: TODAY, updatedAt: TODAY, bid: { ...emptyBid(), auto: { auth: { authorizedAt: TODAY, floorUsd: null, ceilingUsd: null, allowEstimateOnly: true, attestedListing: true, submissionEmail: "", paused: false }, progress: { phase: "authorized", lastRunAt: null, summary: "", needs: [], notifiedKey: "", pageHash: "", subResearchAt: null, compsAt: null, pricing: null } } } }],
  subcontractors: [],
  quotes: [],
  events: [],
  autopilotPaused: false,
});

const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

const evt = (id: string): Patch => ({ id, at: "t", kind: "event", event: { id, at: "t", itemId: null, kind: "info", title: id, detail: "" } });

describe("cloud sync routes", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-enough-password");
    vi.stubEnv("AUTH_SECRET", SECRET);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STATE_STORE", "memory");
    resetMemoryStore();
  });
  afterEach(() => vi.unstubAllEnvs());
  const cookie = async () => ({ cookie: `kl_admin=${await signSession(SECRET)}` });

  it("requires a signed-in admin", async () => {
    const { GET, PUT } = await import("@/app/api/admin/state/route");
    expect((await GET(req("GET", "/api/admin/state"))).status).toBe(401);
    expect((await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: state(), acked: [] }))).status).toBe(401);
  });

  it("reports that background mode is off when no store is configured", async () => {
    vi.stubEnv("STATE_STORE", "");
    const { GET, PUT } = await import("@/app/api/admin/state/route");
    expect(await (await GET(req("GET", "/api/admin/state", undefined, await cookie()))).json()).toEqual({ enabled: false });
    expect((await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: state(), acked: [] }, await cookie()))).status).toBe(503);
  });

  it("stores the browser's state, bumps the revision, and refuses a stale browser", async () => {
    const { GET, PUT } = await import("@/app/api/admin/state/route");
    const h = await cookie();
    const empty = await (await GET(req("GET", "/api/admin/state", undefined, h))).json();
    expect(empty).toMatchObject({ enabled: true, clientRev: 0, state: null });
    const first = await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: state("one"), acked: [] }, h));
    expect(first.status).toBe(200);
    expect((await first.json()).clientRev).toBe(1);
    const got = await (await GET(req("GET", "/api/admin/state", undefined, h))).json();
    expect(got.clientRev).toBe(1);
    expect(got.state.items[0].notes).toBe("one");
    const stale = await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: state("two"), acked: [] }, h));
    expect(stale.status).toBe(409);
    expect((await stale.json()).clientRev).toBe(1);
    expect((await PUT(req("PUT", "/api/admin/state", { baseRev: 1, state: state("three"), acked: [] }, h))).status).toBe(200);
  });

  it("keeps autopilot patches the browser has not acknowledged, and drops the ones it has", async () => {
    const { PUT } = await import("@/app/api/admin/state/route");
    const h = await cookie();
    await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: state(), acked: [] }, h));
    const store = getStore()!;
    const cur = (await store.get())!;
    await store.put({ ...cur.stored, outbox: [evt("e1"), evt("e2")] }, cur.etag);
    const res = await PUT(req("PUT", "/api/admin/state", { baseRev: 1, state: state("x"), acked: ["e1"] }, h));
    const body = await res.json();
    expect(body.outbox.map((p: Patch) => p.id)).toEqual(["e2"]);
    const after = (await store.get())!.stored;
    expect(after.outbox.map((p) => p.id)).toEqual(["e2"]);
    expect(after.state.events.map((e) => e.id)).toEqual(["e2"]); // laid over the browser's state so nothing is lost
  });

  it("rejects malformed or oversized state instead of storing it", async () => {
    const { PUT } = await import("@/app/api/admin/state/route");
    const h = await cookie();
    const bad = state();
    (bad.items[0] as unknown as { status: string }).status = "bogus";
    expect((await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: bad, acked: [] }, h))).status).toBe(400);
    expect((await PUT(req("PUT", "/api/admin/state", { baseRev: 0, state: { version: 2 }, acked: [] }, h))).status).toBe(400);
  });

  it("the scheduled pass refuses anyone without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/autopilot/route");
    expect((await GET(req("GET", "/api/cron/autopilot"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "a-sufficiently-long-cron-secret");
    expect((await GET(req("GET", "/api/cron/autopilot"))).status).toBe(401);
    expect((await GET(req("GET", "/api/cron/autopilot", undefined, { authorization: "Bearer wrong-wrong-wrong-wrong" }))).status).toBe(401);
    const ok = await GET(req("GET", "/api/cron/autopilot", undefined, { authorization: "Bearer a-sufficiently-long-cron-secret" }));
    expect(ok.status).toBe(200);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("GET", "/api/cron/autopilot", undefined, { authorization: "Bearer " }))).status).toBe(401);
  });

  it("the run endpoint needs the admin, and needs state when there is no cloud store", async () => {
    const { POST } = await import("@/app/api/admin/autopilot/run/route");
    expect((await POST(req("POST", "/api/admin/autopilot/run", {}))).status).toBe(401);
    vi.stubEnv("STATE_STORE", "");
    expect((await POST(req("POST", "/api/admin/autopilot/run", {}, await cookie()))).status).toBe(400);
  });
});
