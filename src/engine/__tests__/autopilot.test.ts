import { describe, expect, it } from "vitest";
import { analyze, type World } from "../analyze";
import { bidEmailFor, decide, sameCompany, staffingCheck, type AutoInput } from "../autopilot";
import { buildBidPackage } from "../bid-docs";
import { buildWinBriefing } from "../briefing";
import { emptyBid } from "../config";
import { extractSubmissionEmail } from "../extract";
import { recommendPrice } from "../price-strategy";
import { subcontractOfferScript } from "../scripts";
import { rankSubs } from "../sub-rank";
import type { AutoAuthorization, BidRecord, Inputs, Opportunity, Settings, Subcontractor } from "../types";
import { cleanOpp, cleanTerms, goodInputs, quote, settings, sub, TODAY, world } from "./helpers";

const contact = { companyName: "Kingsless LLC", contactName: "Cullen McKinney", email: "cullen@kingsless.org", phone: "(512) 217-7788", title: "Owner", address: "1 Main St, Austin, TX 78701", capability: "We deliver facility services through vetted subcontractors." };
const S = (over: Partial<Settings> = {}) => settings({ contact, ...over });
const auth = (over: Partial<AutoAuthorization> = {}): AutoAuthorization => ({ authorizedAt: TODAY, floorUsd: null, ceilingUsd: null, allowEstimateOnly: true, attestedListing: true, submissionEmail: "bids@county.gov", paused: false, ...over });
const two: Subcontractor[] = [sub({ id: "s1", name: "Acme Cleaning" }), sub({ id: "s2", name: "Bright Janitorial" })];

function ctx(over: { opp?: Partial<Opportunity>; inputs?: Partial<Inputs>; subs?: Subcontractor[]; quotes?: ReturnType<typeof quote>[]; auth?: Partial<AutoAuthorization> | null; bid?: Partial<BidRecord>; email?: boolean; today?: number; found?: string | null; w?: Partial<World> } = {}): AutoInput {
  const opp = cleanOpp({ provenance: { verified: true, checkedOn: TODAY, note: "" }, ...over.opp });
  const inputs = goodInputs({ marketPriceUsd: 4000, plannedBidUsd: 3800, ...over.inputs });
  const subs = over.subs ?? two;
  const s = S();
  const w = world({ settings: s, subcontractors: subs, quotes: over.quotes ?? [], ...over.w });
  const analysis = analyze({ opportunity: opp, inputs }, w);
  const bid: BidRecord = { ...emptyBid(), ...over.bid, auto: over.auth === null ? null : { auth: auth(over.auth ?? {}), progress: { phase: "authorized", lastRunAt: null, summary: "", needs: [], notifiedKey: "", pageHash: "", subResearchAt: null, compsAt: null, pricing: null } } };
  const pkg = buildBidPackage({ opp, analysis, inputs, bid, settings: s, today: TODAY });
  return { item: { opportunity: opp, inputs }, bid, analysis, pkg, subs, emailConfigured: over.email ?? true, submissionsToday: over.today ?? 0, discoveredEmail: over.found ?? null };
}

describe("price strategy", () => {
  const item = (inputs: Partial<Inputs> = {}, opp: Partial<Opportunity> = {}) => ({ opportunity: cleanOpp(opp), inputs: goodInputs({ marketPriceUsd: 4000, plannedBidUsd: null, ...inputs }) });
  const w = world({ subcontractors: two });

  it("chooses a price between the walk-away line and the market, and explains the trade", () => {
    const r = recommendPrice(item(), w, { floorUsd: null, ceilingUsd: null });
    expect(r.choice).not.toBeNull();
    const c = r.choice!;
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs({ marketPriceUsd: 4000, plannedBidUsd: null }) }, w);
    expect(c.priceUsd).toBeGreaterThanOrEqual(a.prices.walkAwayPriceUsd!);
    expect(c.priceUsd).toBeLessThanOrEqual(4000);
    expect(c.expectedProfitUsd).toBeGreaterThan(0);
    expect(c.considered.length).toBeGreaterThan(2);
    expect(c.note).toMatch(/heuristic/);
  });

  it("maximizes expected profit: nothing it weighed beats the choice", () => {
    const c = recommendPrice(item(), w, { floorUsd: null, ceilingUsd: null }).choice!;
    for (const k of c.considered) expect(k.expectedProfitUsd).toBeLessThanOrEqual(c.expectedProfitUsd + 1e-6);
  });

  it("never goes below the owner's floor or above the ceiling", () => {
    const c = recommendPrice(item(), w, { floorUsd: 3850, ceilingUsd: 3900 }).choice!;
    expect(c.priceUsd).toBeGreaterThanOrEqual(3850);
    expect(c.priceUsd).toBeLessThanOrEqual(3900);
    // a ceiling under the walk-away line (about $3,791 at a cautious sub price) leaves no price at all
    const none = recommendPrice(item(), w, { floorUsd: null, ceilingUsd: 3600 });
    expect(none.choice).toBeNull();
    expect(none.reason).toMatch(/above the most you would bid/);
  });

  it("refuses when no price is both competitive and profitable", () => {
    const r = recommendPrice(item({ subPriceEstimateUsd: 3900 }), w, { floorUsd: null, ceilingUsd: null });
    expect(r.choice).toBeNull();
    expect(r.reason).toBeTruthy();
  });

  it("asks for what it needs instead of guessing", () => {
    expect(recommendPrice(item({ marketPriceUsd: null }), w, { floorUsd: null, ceilingUsd: null }).reason).toMatch(/market price/i);
    expect(recommendPrice(item({ subPriceEstimateUsd: null }), w, { floorUsd: null, ceilingUsd: null }).reason).toMatch(/subcontractor/i);
  });

  it("never picks a price that fails a rule", () => {
    const r = recommendPrice({ opportunity: cleanOpp({ terms: cleanTerms({ subcontracting: "unknown" }) }), inputs: goodInputs({ marketPriceUsd: 4000, plannedBidUsd: null }) }, w, { floorUsd: null, ceilingUsd: null });
    expect(r.choice).toBeNull();
    expect(r.reason).toMatch(/passes every rule/);
  });
});

describe("staffing check", () => {
  const a = (subs: Subcontractor[], opp: Partial<Opportunity> = {}) => analyze({ opportunity: cleanOpp(opp), inputs: goodInputs() }, world({ subcontractors: subs }));
  it("needs enough plausible subcontractors on file", () => {
    expect(staffingCheck(cleanOpp(), a(two), two).ok).toBe(true);
    expect(staffingCheck(cleanOpp(), a([two[0]!]), [two[0]!]).ok).toBe(false);
  });
  it("ignores declined, out-of-area and (when a license is required) unlicensed companies", () => {
    const opp = { terms: cleanTerms({ licensingRequired: "yes" }) };
    const subs = [sub({ id: "s1", name: "A", licenses: [{ name: "TX lic", verifiedOn: null }] }), sub({ id: "s2", name: "B" }), sub({ id: "s3", name: "C", willingToSubcontract: "no", licenses: [{ name: "x", verifiedOn: null }] }), sub({ id: "s4", name: "D", coverage: ["OK"], licenses: [{ name: "x", verifiedOn: null }] })];
    const r = staffingCheck(cleanOpp(opp), a(subs, opp), subs);
    expect(r.qualified).toEqual(["A"]);
    expect(r.ok).toBe(false);
  });
});

describe("autopilot decisions", () => {
  it("submits when everything is proven and the listing says where to email", () => {
    const d = decide(ctx());
    expect(d.action).toBe("submit");
    expect(d.recipient).toBe("bids@county.gov");
  });

  it("bids on an estimate only when the owner allowed it and enough subs are on file", () => {
    expect(decide(ctx({ auth: { allowEstimateOnly: false } })).action).toBe("needs-you");
    expect(decide(ctx({ subs: [two[0]!] })).action).toBe("needs-you");
    expect(decide(ctx({ subs: [two[0]!] })).needs.join(" ")).toMatch(/at least 2 subcontractors/);
  });

  it("accepts a firm quote from a confirmed sub in place of the estimate rules", () => {
    const subs = [sub({ id: "s1", name: "Acme Cleaning", willingToSubcontract: "yes" })];
    const d = decide(ctx({ subs, quotes: [quote()], auth: { allowEstimateOnly: false } }));
    expect(d.action).toBe("submit");
  });

  it("stops for good when a rule fails, and asks when a rule is merely unproven", () => {
    const stop = decide(ctx({ opp: { terms: cleanTerms({ subcontracting: "prohibited" }) } }));
    expect(stop.action).toBe("stop");
    expect(stop.summary).toMatch(/Dropped/);
    expect(decide(ctx({ opp: { terms: cleanTerms({ subcontracting: "unknown" }) } })).action).toBe("needs-you");
  });

  it("will not bid outside the owner's price band or below walk-away", () => {
    expect(decide(ctx({ inputs: { plannedBidUsd: 3000 } })).action).toBe("needs-you");
    expect(decide(ctx({ auth: { ceilingUsd: 3500 } })).checks.find((c) => c.id === "price")?.ok).toBe(false);
    expect(decide(ctx({ auth: { floorUsd: 3900 } })).checks.find((c) => c.id === "price")?.ok).toBe(false);
    expect(decide(ctx({ inputs: { plannedBidUsd: null } })).action).toBe("needs-you");
  });

  it("will not send documents with blanks", () => {
    const d = ctx();
    const blank = analyze({ opportunity: d.item.opportunity, inputs: d.item.inputs }, world({ settings: settings({ contact: { ...contact, address: "" } }), subcontractors: two }));
    const pkg = buildBidPackage({ opp: d.item.opportunity, analysis: blank, inputs: d.item.inputs, bid: d.bid, settings: settings({ contact: { ...contact, address: "" } }), today: TODAY });
    const r = decide({ ...d, pkg });
    expect(r.action).toBe("needs-you");
    expect(r.needs.join(" ")).toMatch(/mailing address/);
  });

  it("prepares the bid but does not email when the agency takes bids through a portal or email is off", () => {
    expect(decide(ctx({ auth: { submissionEmail: "" } })).action).toBe("ready-to-upload");
    expect(decide(ctx({ email: false })).action).toBe("ready-to-upload");
    expect(decide(ctx({ auth: { submissionEmail: "" }, found: "rfp@city.gov" })).recipient).toBe("rfp@city.gov");
  });

  it("respects pause, the daily limit, an unconfirmed listing, an expired due date and a bid already sent", () => {
    expect(decide(ctx({ auth: { paused: true } })).action).toBe("wait");
    expect(decide(ctx({ auth: { attestedListing: false } })).action).toBe("stop");
    expect(decide(ctx({ auth: null })).action).toBe("stop");
    expect(decide(ctx({ today: 5 })).action).toBe("wait");
    expect(decide(ctx({ opp: { dueDate: "2026-10-01" } })).action).toBe("expire");
    const sent = ctx({ bid: { submission: { submittedOn: TODAY, method: "console-email", confirmation: "x", priceUsd: 3800, note: "" } } });
    expect(decide(sent).action).toBe("wait");
  });

  it("never emails anyone but the agency address it was given", () => {
    const d = decide(ctx({ auth: { submissionEmail: "not an email" }, found: null }));
    expect(d.recipient).toBeNull();
    expect(d.action).toBe("ready-to-upload");
  });

  it("builds a plain bid email signed by the owner", () => {
    const m = bidEmailFor(cleanOpp(), S());
    expect(m.subject).toContain("D-1");
    expect(m.message).toContain("Cullen McKinney");
    expect(m.message).not.toMatch(/\$\d/);
  });
});

describe("reading the listing", () => {
  it("finds the address bids go to, and only when it is unambiguous", () => {
    expect(extractSubmissionEmail("Bids must be submitted by email to purchasing@city.gov before 2:00 PM.")).toBe("purchasing@city.gov");
    expect(extractSubmissionEmail("Questions: contact john@city.gov. Proposals shall be emailed to rfp@city.gov.")).toBe("rfp@city.gov");
    expect(extractSubmissionEmail("For questions or assistance, contact john@city.gov.")).toBeNull();
    expect(extractSubmissionEmail("Submit your bid to a@city.gov or to b@county.gov.")).toBeNull();
    expect(extractSubmissionEmail("No addresses here.")).toBeNull();
  });

  it("matches the company in a public award record by name, ignoring LLC and punctuation", () => {
    expect(sameCompany("KINGSLESS, L.L.C.", "Kingsless LLC")).toBe(true);
    expect(sameCompany("Kingsless Construction Inc", "Kingsless LLC")).toBe(false);
    expect(sameCompany("", "Kingsless LLC")).toBe(false);
    expect(sameCompany("Other Co", "Kingsless LLC", { awardee: "abc123", ours: "ABC123" })).toBe(true);
  });
});

describe("recommended subcontractors", () => {
  const opp = cleanOpp({ terms: cleanTerms({ licensingRequired: "yes" }) });
  const subs = [sub({ id: "s1", name: "Acme Cleaning LLC", licenses: [{ name: "TX", verifiedOn: TODAY }], capacityConfirmed: true, willingToSubcontract: "yes", similarProjects: [{ description: "x", year: 2025, referenceVerified: true }] }), sub({ id: "s2", name: "Declined Co", willingToSubcontract: "no" })];
  const a = analyze({ opportunity: opp, inputs: goodInputs() }, world({ subcontractors: subs }));
  const ranked = rankSubs({
    opp,
    today: TODAY,
    candidates: a.candidates,
    subs,
    webLeads: [{ name: "Lone Star Janitorial", services: ["janitorial"], city: "Houston", state: "TX", website: null, phone: "713-555-0100", email: null, licenses: ["TX license 123"], similarWork: "County offices", sourceUrl: "https://x.example" }, { name: "acme cleaning", services: ["janitorial"], city: "Houston", state: "TX", website: "https://acme.example", phone: null, email: "a@acme.example", licenses: [], similarWork: null, sourceUrl: "https://acme.example/about" }],
    federalLeads: [{ name: "Fed Sub Inc", count: 4, totalUsd: 250_000, latest: "2026-03-01", states: ["TX"], uei: "UEI1" }],
  });

  it("puts the company you have evidence on first, leads after, and drops anyone who declined", () => {
    expect(ranked[0]!.name).toBe("Acme Cleaning LLC");
    expect(ranked[0]!.source).toBe("directory");
    expect(ranked.map((r) => r.name)).not.toContain("Declined Co");
    expect(ranked.findIndex((r) => r.name === "Lone Star Janitorial")).toBeGreaterThan(0);
  });

  it("merges the same company found twice and keeps the stronger entry's reasons plus the other's", () => {
    expect(ranked.filter((r) => /acme/i.test(r.name))).toHaveLength(1);
    expect(ranked[0]!.website).toBe("https://acme.example");
    expect(ranked[0]!.subcontractorId).toBe("s1");
  });

  it("scores leads from what their pages state and never calls a lead verified", () => {
    const lone = ranked.find((r) => r.name === "Lone Star Janitorial")!;
    expect(lone.label).toBe("lead");
    expect(lone.score).toBeLessThanOrEqual(84);
    expect(lone.reasons.join(" ")).toMatch(/Based in TX/);
    expect(lone.concerns.join(" ")).toMatch(/Not verified/);
    const fed = ranked.find((r) => r.name === "Fed Sub Inc")!;
    expect(fed.score).toBeLessThanOrEqual(72);
    expect(fed.concerns.join(" ")).toMatch(/no contact details/);
  });

  it("is sorted best first", () => {
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
  });
});

describe("win briefing", () => {
  const opp = cleanOpp({ provenance: { verified: true, checkedOn: TODAY, note: "" } });
  const inputs = goodInputs({ marketPriceUsd: 4000, plannedBidUsd: 3800 });
  const s = S();
  const a = analyze({ opportunity: opp, inputs }, world({ settings: s, subcontractors: two }));
  const bid: BidRecord = { ...emptyBid(), submission: { submittedOn: TODAY, method: "console-email", confirmation: "m1", priceUsd: 3800, note: "" }, outcome: { result: "won", decidedOn: TODAY, awardUsd: 3800, note: "" } };
  const ranked = rankSubs({ opp, today: TODAY, candidates: a.candidates, subs: two, webLeads: [], federalLeads: [] });
  const b = buildWinBriefing({ opp, analysis: a, inputs, bid, settings: s, today: TODAY, ranked });

  it("tells the owner what they won and what they now owe", () => {
    expect(b.headline).toBe("Won: Janitorial services, county annex for $3,800");
    expect(b.contract.find(([k]) => k === "Award")?.[1]).toBe("$3,800");
    expect(b.obligations[0]).toMatch(/whoever does the work/);
    expect(b.risks[0]).toMatch(/still bound to perform/);
  });

  it("gives an opening offer, a ceiling and the profit at each", () => {
    expect(b.offer.openingOfferUsd).toBe(2600);
    expect(b.offer.maxSubPriceUsd).toBeGreaterThan(2600);
    expect(b.offer.profitAtOpeningUsd!).toBeGreaterThan(b.offer.profitAtMaxUsd!);
    expect(b.offer.profitAtMaxUsd!).toBeGreaterThan(0);
  });

  it("lists the ranked subcontractors and a message that never reveals the award or the ceiling", () => {
    expect(b.subs.map((x) => x.name)).toEqual(ranked.map((x) => x.name));
    expect(b.offerMessage.body).toContain("$2,600");
    expect(b.offerMessage.body).not.toContain("3,800");
    expect(b.offerMessage.body).not.toContain(String(Math.round(b.offer.maxSubPriceUsd!)));
    const direct = subcontractOfferScript(opp, inputs, s, null, TODAY);
    expect(direct.body).toMatch(/Please send your price/);
  });
});
