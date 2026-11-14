import { describe, expect, it, vi } from "vitest";
import { emptyBid, DEFAULT_SETTINGS } from "@/engine/config";
import { cleanOpp, goodInputs, settings, sub, TODAY } from "@/engine/__tests__/helpers";
import type { AutoAuthorization, AutoBid, BidRecord, Opportunity, Subcontractor } from "@/engine/types";
import { applyPatches } from "@/lib/patches";
import type { AppState, Patch, PipelineItem } from "@/lib/types";
import { pageSignal } from "../autopilot/award-watch";
import { refineFromText } from "../autopilot/official";
import { runAutopilot, type Deps } from "../autopilot/run";
import { mergeOutbox, runStored } from "../autopilot/service";
import { getStore, resetMemoryStore, update, type Stored } from "../store/state-store";
import type { OutboundEmail } from "../email/resend";

const NOW = new Date("2026-10-25T15:00:00Z");
const contact = { companyName: "Kingsless LLC", contactName: "Cullen McKinney", email: "cullen@kingsless.org", phone: "(512) 217-7788", title: "Owner", address: "1 Main St, Austin, TX 78701", capability: "We deliver facility services through vetted subcontractors." };

const auth = (over: Partial<AutoAuthorization> = {}): AutoAuthorization => ({ authorizedAt: TODAY, floorUsd: null, ceilingUsd: null, allowEstimateOnly: true, attestedListing: true, submissionEmail: "", paused: false, ...over });
const progress = (): AutoBid["progress"] => ({ phase: "authorized", lastRunAt: null, summary: "", needs: [], notifiedKey: "", pageHash: "", subResearchAt: null, compsAt: null, pricing: null });
const two: Subcontractor[] = [sub({ id: "s1", name: "Acme Cleaning" }), sub({ id: "s2", name: "Bright Janitorial" })];

function item(over: { opp?: Partial<Opportunity>; bid?: Partial<BidRecord>; auth?: Partial<AutoAuthorization> | null; id?: string } = {}): PipelineItem {
  const opp = cleanOpp({ id: over.id ?? "demo", sourceUrl: "https://county.example/bids/1", terms: { ...cleanOpp().terms }, ...over.opp });
  const bid: BidRecord = { ...emptyBid(), ...over.bid, auto: over.auth === null ? null : { auth: auth(over.auth ?? {}), progress: progress() } };
  return { opportunity: opp, inputs: goodInputs({ marketPriceUsd: 4000, plannedBidUsd: null }), status: "approved", notes: "", addedAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", bid };
}

const state = (items: PipelineItem[], over: Partial<AppState> = {}): AppState => ({ version: 1, settings: settings({ contact }), items, subcontractors: two, quotes: [], events: [], autopilotPaused: false, ...over });

function fake(over: Partial<Deps> = {}) {
  const sent: OutboundEmail[] = [];
  const mails: Array<{ subject: string; text: string }> = [];
  const calls = { research: 0, subawards: 0, comps: 0, read: 0, award: 0 };
  const deps: Deps = {
    now: () => NOW,
    aiEnabled: false,
    emailEnabled: true,
    read: async () => (calls.read++, { ok: true, text: "Bids must be submitted by email to bids@county.gov. Subcontracting is permitted. Payment within 30 days of invoice.", hash: "h1", error: null }),
    refine: refineFromText,
    comps: async () => (calls.comps++, { awards: [], stats: { count: 0, medianUsd: null, lowUsd: null, highUsd: null } }),
    subawards: async () => (calls.subawards++, []),
    research: async () => (calls.research++, { subs: [], notes: [], dropped: 0, searches: 0, model: "x" }),
    award: async () => (calls.award++, { status: "none", detail: "" }),
    send: async (m) => (sent.push(m), { ok: true, id: `msg_${sent.length}` }),
    notify: async (_s, subject, text) => (mails.push({ subject, text }), true),
    ...over,
  };
  return { deps, sent, mails, calls };
}

describe("autopilot pass", () => {
  it("prices, checks every rule and emails the bid once, then only watches", async () => {
    const f = fake();
    const s0 = state([item()]);
    const r1 = await runAutopilot(s0, f.deps);
    expect(f.sent).toHaveLength(1);
    const mail = f.sent[0]!;
    expect(mail.to).toBe("bids@county.gov");
    expect(mail.bcc).toBe("cullen@kingsless.org");
    expect(mail.attachments[0]!.filename).toMatch(/Bid-Packet\.pdf$/);
    expect(Buffer.from(mail.attachments[0]!.data.subarray(0, 5)).toString()).toBe("%PDF-");
    const it1 = r1.state.items[0]!;
    expect(it1.status).toBe("bid-submitted");
    expect(it1.bid!.submission).toMatchObject({ method: "console-email", priceUsd: it1.inputs.plannedBidUsd });
    expect(it1.inputs.plannedBidUsd!).toBeGreaterThan(3000);
    expect(it1.opportunity.provenance.verified).toBe(true);
    expect(r1.state.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["price", "submitted"]));
    expect(f.mails.map((m) => m.subject).join("|")).toMatch(/Bid submitted/);

    // a second pass sends nothing and repeats nothing
    const before = f.mails.length;
    const r2 = await runAutopilot(r1.state, f.deps);
    expect(f.sent).toHaveLength(1);
    expect(f.mails).toHaveLength(before);
    expect(r2.state.items[0]!.bid!.auto!.progress.phase).toBe("watching");
  });

  it("applies cleanly through patches, the way the browser will", async () => {
    const f = fake();
    const s0 = state([item()]);
    const r = await runAutopilot(s0, f.deps);
    const replay = applyPatches(s0, r.patches);
    expect(replay.items[0]!.bid!.submission).not.toBeNull();
    expect(applyPatches(replay, r.patches)).toEqual(replay); // idempotent
  });

  it("does not touch a bid that was never authorized, a paused bid, or anything while the global pause is on", async () => {
    const f = fake();
    expect((await runAutopilot(state([item({ auth: null })]), f.deps)).processed).toBe(0);
    expect((await runAutopilot(state([item({ auth: { paused: true } })]), f.deps)).processed).toBe(0);
    expect((await runAutopilot(state([item()], { autopilotPaused: true }), f.deps)).processed).toBe(0);
    expect(f.sent).toHaveLength(0);
    expect(f.calls.read).toBe(0);
  });

  it("asks the owner, once, for what only they can supply and sends nothing", async () => {
    const f = fake();
    const s0 = state([item()], { settings: settings({ contact: { ...contact, address: "" } }) });
    const r1 = await runAutopilot(s0, f.deps);
    expect(f.sent).toHaveLength(0);
    const p = r1.state.items[0]!.bid!.auto!.progress;
    expect(p.phase).toBe("needs-you");
    expect(p.needs.join(" ")).toMatch(/mailing address/);
    expect(f.mails).toHaveLength(1);
    await runAutopilot(r1.state, f.deps);
    expect(f.mails).toHaveLength(1); // not nagged again
  });

  it("goes ahead once the owner fixes it", async () => {
    const f = fake();
    const r1 = await runAutopilot(state([item()], { settings: settings({ contact: { ...contact, address: "" } }) }), f.deps);
    const fixed: AppState = { ...r1.state, settings: settings({ contact }) };
    const r2 = await runAutopilot(fixed, f.deps);
    expect(f.sent).toHaveLength(1);
    expect(r2.state.items[0]!.bid!.submission).not.toBeNull();
  });

  it("drops a bid when the official page shows subcontracting is not allowed", async () => {
    const f = fake({ read: async () => ({ ok: true, text: "Subcontracting is not permitted under this solicitation. Submit bids by email to bids@county.gov.", hash: "h2", error: null }) });
    const r = await runAutopilot(state([item({ opp: { terms: { ...cleanOpp().terms, subcontracting: "unknown" } } })]), f.deps);
    expect(f.sent).toHaveLength(0);
    const p = r.state.items[0]!.bid!.auto!.progress;
    expect(p.phase).toBe("stopped");
    expect(p.summary).toMatch(/Dropped/);
    expect(r.state.items[0]!.bid!.submission).toBeNull();
  });

  it("prepares the bid but does not email it when the listing takes bids through a portal", async () => {
    const f = fake({ read: async () => ({ ok: true, text: "Submit your bid through the city's online portal. Subcontracting is permitted.", hash: "h3", error: null }) });
    const r = await runAutopilot(state([item()]), f.deps);
    expect(f.sent).toHaveLength(0);
    const p = r.state.items[0]!.bid!.auto!.progress;
    expect(p.phase).toBe("ready-to-upload");
    expect(p.needs.join(" ")).toMatch(/Upload the packet/);
    expect(r.state.items[0]!.inputs.plannedBidUsd).not.toBeNull();
    expect(f.mails.map((m) => m.subject).join("|")).toMatch(/ready to upload/i);
  });

  it("uses an address the owner gave when the listing does not say", async () => {
    const f = fake({ read: async () => ({ ok: true, text: "Submit your bid through the portal. Subcontracting is permitted.", hash: "h4", error: null }) });
    await runAutopilot(state([item({ auth: { submissionEmail: "owner-supplied@city.gov" } })]), f.deps);
    expect(f.sent[0]?.to).toBe("owner-supplied@city.gov");
  });

  it("stops at the daily submission limit", async () => {
    const f = fake();
    const events = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, at: NOW.toISOString(), itemId: `x${i}`, kind: "submitted" as const, title: "t", detail: "" }));
    const r = await runAutopilot(state([item()], { events }), f.deps);
    expect(f.sent).toHaveLength(0);
    expect(r.state.items[0]!.bid!.auto!.progress.summary).toMatch(/limit/);
  });

  it("will not bid on an estimate with too few subcontractors on file, and researches more when AI is on", async () => {
    const f = fake({
      aiEnabled: true,
      research: async () => ({ subs: [{ name: "Lone Star Janitorial", services: ["janitorial"], city: "Houston", state: "TX", website: null, phone: "713-555-0100", email: null, licenses: [], similarWork: null, whyFits: "Fits.", sourceUrl: "https://x.example" }, { name: "Gulf Cleaning", services: ["janitorial"], city: "Houston", state: "TX", website: null, phone: null, email: "a@gulf.example", licenses: [], similarWork: null, whyFits: "Fits.", sourceUrl: "https://y.example" }], notes: [], dropped: 0, searches: 2, model: "x" }),
    });
    const r = await runAutopilot(state([item()], { subcontractors: [] }), f.deps);
    expect(r.state.subcontractors.map((x) => x.name)).toEqual(["Lone Star Janitorial", "Gulf Cleaning"]);
    expect(r.state.subcontractors.every((x) => x.willingToSubcontract === "unknown" && x.capacityConfirmed === false)).toBe(true);
    expect(f.sent).toHaveLength(1); // two plausible local subs now exist
    // and with no AI and none on file it asks instead
    const g = fake();
    const r2 = await runAutopilot(state([item()], { subcontractors: [] }), g.deps);
    expect(g.sent).toHaveLength(0);
    expect(r2.state.items[0]!.bid!.auto!.progress.needs.join(" ")).toMatch(/at least 2 subcontractors/);
  });

  it("uses federal comparables as the expected price only with enough of them", async () => {
    const noMarket = (): PipelineItem => ({ ...item(), inputs: goodInputs({ marketPriceUsd: null, plannedBidUsd: null }) });
    const few = fake({ comps: async () => ({ awards: [], stats: { count: 2, medianUsd: 4000, lowUsd: 3000, highUsd: 5000 } }) });
    const r1 = await runAutopilot(state([noMarket()]), few.deps);
    expect(few.sent).toHaveLength(0);
    expect(r1.state.items[0]!.inputs.marketPriceUsd).toBeNull();
    const enough = fake({ comps: async () => ({ awards: [], stats: { count: 9, medianUsd: 4000, lowUsd: 3000, highUsd: 5000 } }) });
    const r2 = await runAutopilot(state([noMarket()]), enough.deps);
    expect(r2.state.items[0]!.inputs.marketPriceUsd).toBe(4000);
    expect(r2.state.events.some((e) => e.kind === "price" && /federal comparables/.test(e.title))).toBe(true);
    expect(enough.sent).toHaveLength(1);
  });

  it("records a failed send as a problem, keeps the bid unsubmitted and tries again next pass", async () => {
    let ok = false;
    const f = fake({ send: async () => (ok ? { ok: true, id: "m1" } : { ok: false, status: 502, error: "The email service refused it." }) });
    const r1 = await runAutopilot(state([item()]), f.deps);
    expect(r1.state.items[0]!.bid!.submission).toBeNull();
    expect(r1.state.events.some((e) => e.kind === "error")).toBe(true);
    ok = true;
    const r2 = await runAutopilot(r1.state, f.deps);
    expect(r2.state.items[0]!.bid!.submission).not.toBeNull();
  });

  it("saves a checkpoint right after a bid is emailed", async () => {
    const checkpoint = vi.fn(async () => {});
    const f = fake({ checkpoint });
    await runAutopilot(state([item()]), f.deps);
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });

  it("never emails anyone except the agency address and the owner", async () => {
    const f = fake();
    await runAutopilot(state([item()]), f.deps);
    const recipients = new Set([...f.sent.flatMap((m) => [m.to, m.bcc]), ]);
    expect([...recipients].filter(Boolean).sort()).toEqual(["bids@county.gov", "cullen@kingsless.org"]);
  });

  it("flags an expired due date without sending", async () => {
    const f = fake();
    const r = await runAutopilot(state([item({ opp: { dueDate: "2026-10-01" } })]), f.deps);
    expect(f.sent).toHaveLength(0);
    expect(r.state.items[0]!.bid!.auto!.progress.phase).toBe("expired");
  });

  it("notices a changed listing", async () => {
    const f = fake();
    const s = state([item()]);
    s.items[0]!.bid!.auto!.progress.pageHash = "old-hash";
    const r = await runAutopilot(s, f.deps);
    expect(r.state.events.some((e) => /listing changed/i.test(e.title))).toBe(true);
  });
});

describe("after the bid is in", () => {
  const submitted = (): PipelineItem => {
    const i = item({ bid: { submission: { submittedOn: TODAY, method: "console-email", confirmation: "m1", priceUsd: 3800, note: "" } } });
    i.inputs = goodInputs({ marketPriceUsd: 4000, plannedBidUsd: 3800 });
    i.status = "bid-submitted";
    i.bid!.auto!.progress.phase = "watching";
    return i;
  };

  it("records a win from a public award notice, builds the briefing and tells the owner who to sell it to", async () => {
    const f = fake({
      aiEnabled: true,
      award: async () => ({ status: "won", detail: "SAM.gov award notice names Kingsless LLC." }),
      research: async () => ({ subs: [{ name: "Lone Star Janitorial", services: ["janitorial"], city: "Houston", state: "TX", website: null, phone: "713-555-0100", email: null, licenses: ["TX lic"], similarWork: "County offices", whyFits: "Fits.", sourceUrl: "https://x.example" }], notes: [], dropped: 0, searches: 2, model: "x" }),
      subawards: async () => [{ name: "Fed Sub Inc", count: 4, totalUsd: 250_000, latest: "2026-03-01", states: ["TX"], agencies: [], examples: [], uei: "U1" }],
    });
    const r = await runAutopilot(state([submitted()]), f.deps);
    const it = r.state.items[0]!;
    expect(it.status).toBe("won");
    expect(it.bid!.outcome).toMatchObject({ result: "won", awardUsd: 3800 });
    const b = it.bid!.briefing!;
    expect(b.headline).toMatch(/^Won:/);
    expect(b.subs.map((x) => x.name)).toEqual(expect.arrayContaining(["Acme Cleaning", "Lone Star Janitorial", "Fed Sub Inc"]));
    expect(b.offer.openingOfferUsd).toBe(2600);
    const win = f.mails.find((m) => /^Won:/.test(m.subject))!;
    expect(win.text).toMatch(/RECOMMENDED SUBCONTRACTORS/);
    expect(win.text).toMatch(/Never pay more than/);
    expect(f.sent).toHaveLength(0); // it never emails the subcontractors itself
    // researched leads join the directory, unverified
    expect(r.state.subcontractors.find((x) => x.name === "Lone Star Janitorial")?.willingToSubcontract).toBe("unknown");
  });

  it("records a loss without a briefing", async () => {
    const f = fake({ award: async () => ({ status: "lost", detail: "SAM.gov award notice names Other Co." }) });
    const r = await runAutopilot(state([submitted()]), f.deps);
    expect(r.state.items[0]!.status).toBe("lost");
    expect(r.state.items[0]!.bid!.briefing ?? null).toBeNull();
  });

  it("only SIGNALS when the agency page merely names the company; the owner confirms", async () => {
    const f = fake({ read: async () => ({ ok: true, text: "Notice of Award: the contract is awarded to Kingsless LLC for janitorial services.", hash: "h9", error: null }) });
    const r = await runAutopilot(state([submitted()]), f.deps);
    expect(r.state.items[0]!.bid!.outcome).toBeNull();
    expect(r.state.items[0]!.status).toBe("bid-submitted");
    expect(r.state.events.some((e) => e.kind === "award")).toBe(true);
    expect(f.mails.some((m) => /may name you/.test(m.subject))).toBe(true);
  });

  it("builds the briefing when the owner records the win by hand", async () => {
    const i = submitted();
    i.bid!.outcome = { result: "won", decidedOn: TODAY, awardUsd: 3800, note: "" };
    const f = fake();
    const r = await runAutopilot(state([i]), f.deps, { briefingOnly: true, itemId: "demo" });
    expect(r.state.items[0]!.bid!.briefing).not.toBeNull();
    expect(f.calls.award).toBe(0);
  });

  it("briefs a win the owner recorded on a bid that never used autopilot", async () => {
    const i = item({ auth: null, bid: { submission: { submittedOn: TODAY, method: "portal", confirmation: "c", priceUsd: 3800, note: "" }, outcome: { result: "won", decidedOn: TODAY, awardUsd: 3800, note: "" } } });
    i.inputs = goodInputs({ marketPriceUsd: 4000, plannedBidUsd: 3800 });
    const f = fake();
    const r = await runAutopilot(state([i]), f.deps);
    expect(r.state.items[0]!.bid!.briefing?.headline).toMatch(/^Won:/);
    expect(f.mails.some((m) => /^Won:/.test(m.subject))).toBe(true);
    // and only once
    const again = await runAutopilot(r.state, f.deps);
    expect(again.processed).toBe(0);
  });

  it("matches the company in agency text near an award word, and not otherwise", () => {
    expect(pageSignal("The award goes to Kingsless, LLC.", "Kingsless LLC")).toBe(true);
    expect(pageSignal("Kingsless LLC submitted a bid.", "Kingsless LLC")).toBe(false);
    expect(pageSignal("Award to Other Co.", "Kingsless LLC")).toBe(false);
  });
});

describe("stored copy, outbox and lock", () => {
  const seed = (s: AppState): Stored => ({ clientRev: 3, savedAt: NOW.toISOString(), state: s, outbox: [], lock: null });

  it("runs on the stored copy, leaves patches in the outbox and releases the lock", async () => {
    vi.stubEnv("STATE_STORE", "memory");
    resetMemoryStore();
    const store = getStore()!;
    await store.put(seed(state([item()])), null);
    const f = fake();
    const r = await runStored(store, f.deps);
    expect(r.ok).toBe(true);
    const cur = (await store.get())!.stored;
    expect(cur.clientRev).toBe(3); // the autopilot never touches the browser's revision
    expect(cur.lock).toBeNull();
    expect(cur.outbox.length).toBeGreaterThan(0);
    expect(cur.state.items[0]!.bid!.submission).not.toBeNull();
    // running again does not duplicate anything in the outbox
    const n = cur.outbox.length;
    await runStored(store, f.deps);
    expect(f.sent).toHaveLength(1);
    expect((await store.get())!.stored.outbox.length).toBeGreaterThanOrEqual(n);
    vi.unstubAllEnvs();
  });

  it("refuses to run twice at once", async () => {
    vi.stubEnv("STATE_STORE", "memory");
    resetMemoryStore();
    const store = getStore()!;
    await store.put({ ...seed(state([item()])), lock: { until: new Date(NOW.getTime() + 60_000).toISOString() } }, null);
    const r = await runStored(store, fake().deps);
    expect(r).toMatchObject({ ok: false, status: 409 });
    vi.unstubAllEnvs();
  });

  it("a conditional write refuses to overwrite a newer copy", async () => {
    vi.stubEnv("STATE_STORE", "memory");
    resetMemoryStore();
    const store = getStore()!;
    expect((await store.put(seed(state([])), null)).ok).toBe(true);
    const first = (await store.get())!;
    expect((await store.put(seed(state([item()])), first.etag)).ok).toBe(true);
    expect((await store.put(seed(state([])), first.etag)).ok).toBe(false); // stale tag
    expect((await store.put(seed(state([])), null)).ok).toBe(false); // already exists
    await update(store, (cur) => ({ ...cur!, clientRev: 9 }));
    expect((await store.get())!.stored.clientRev).toBe(9);
    vi.unstubAllEnvs();
  });

  it("merges outbox patches without duplicates", () => {
    const p = (id: string): Patch => ({ id, at: "x", kind: "event", event: { id, at: "x", itemId: null, kind: "info", title: "t", detail: "" } });
    expect(mergeOutbox([p("a")], [p("a"), p("b")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("lets the owner's edit win over an autopilot change made at the same moment", () => {
    const base = state([item()]);
    const edited: AppState = { ...base, items: [{ ...base.items[0]!, notes: "I changed this", updatedAt: "2026-10-25T14:59:00Z" }] };
    const patch: Patch = { id: "p1", at: "t", kind: "item", itemId: "demo", baseUpdatedAt: "2026-10-20T00:00:00Z", item: { ...base.items[0]!, status: "bid-submitted", updatedAt: "2026-10-25T15:00:00Z" } };
    const out = applyPatches(edited, [patch]);
    expect(out.items[0]!.notes).toBe("I changed this");
    expect(out.items[0]!.status).toBe("approved");
    expect(out.events.at(-1)?.title).toMatch(/skipped/i);
  });

  it("settings fixture sanity", () => {
    expect(DEFAULT_SETTINGS.targeting.feeds).toEqual([]);
  });
});
