import { describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { newInputs } from "../factory";
import { generateScripts } from "../scripts";
import { evaluateCandidate, shortlist } from "../subs";
import { TEST_CASE_OPPORTUNITIES } from "../seeds";
import { cleanOpp, cleanTerms, goodInputs, quote, settings, sub, TODAY, world } from "./helpers";

describe("subcontractor verification labels", () => {
  const opp = cleanOpp({ terms: cleanTerms({ insuranceRequired: "yes", insuranceMinLimitUsd: 1_000_000 }) });

  it("a directory listing alone is unverified", () => {
    const c = evaluateCandidate(opp, sub(), [], null, TODAY);
    expect(c.label).toBe("unverified");
    expect(c.gaps.join(" ")).toMatch(/insurance/i);
  });

  it("a firm quote alone makes a candidate partially verified, and lists what is still missing", () => {
    const c = evaluateCandidate(opp, sub(), [quote()], null, TODAY);
    expect(c.label).toBe("partially-verified");
    expect(c.gaps.length).toBeGreaterThan(0);
  });

  it("verified needs quote, willingness, capacity, similar projects, and the required insurance", () => {
    const full = sub({
      willingToSubcontract: "yes",
      capacityConfirmed: true,
      similarProjects: [{ description: "County annex cleaning", year: 2025, referenceVerified: true }],
      insuranceCoverageUsd: 2_000_000,
      insuranceCertOnFile: true,
    });
    expect(evaluateCandidate(opp, full, [quote()], null, TODAY).label).toBe("verified");
    // drop the insurance certificate and it is no longer verified
    expect(evaluateCandidate(opp, { ...full, insuranceCertOnFile: false }, [quote()], null, TODAY).label).toBe("partially-verified");
  });

  it("flags a quote above the maximum sub price", () => {
    const c = evaluateCandidate(opp, sub(), [quote({ amountUsd: 3_900 })], 3_000, TODAY);
    expect(c.checks.find((k) => k.id === "price")?.ok).toBe(false);
  });

  it("ignores directory entries that do not match the scope", () => {
    const list = shortlist(opp, [sub({ id: "a" }), sub({ id: "b", name: "Roofing Co", services: ["roofing"] })], [], null, TODAY);
    expect(list.map((c) => c.subcontractorId)).toEqual(["a"]);
  });

  it("verified candidates sort ahead of unverified ones", () => {
    const strong = sub({
      id: "strong",
      willingToSubcontract: "yes",
      capacityConfirmed: true,
      similarProjects: [{ description: "x", year: 2025, referenceVerified: true }],
      insuranceCoverageUsd: 2_000_000,
      insuranceCertOnFile: true,
    });
    const list = shortlist(opp, [sub({ id: "weak" }), strong], [quote({ subcontractorId: "strong" })], null, TODAY);
    expect(list[0]?.subcontractorId).toBe("strong");
  });
});

describe("scripts", () => {
  const w = world({
    settings: settings({
      contact: { companyName: "Kingsless LLC", contactName: "Alex", email: "a@example.com", phone: "555-0100" },
      profile: { ...settings().profile, insuranceCoverageUsd: 2_000_000 },
    }),
  });
  const opp = cleanOpp({ terms: cleanTerms({ insuranceRequired: "yes", insuranceMinLimitUsd: 1_000_000 }) });
  const inputs = goodInputs();
  const set = generateScripts(opp, analyze({ opportunity: opp, inputs }, w), inputs, w.settings, TODAY);

  it("the quote request uses the owner's wording and fills the bracketed fields", () => {
    const body = set.scripts.find((s) => s.id === "quote-request")!.body;
    expect(body).toContain("Hi, I'm evaluating a project for Demo County involving janitorial cleaning services for a county annex building in Houston, TX.");
    expect(body).toContain("provide a firm quote that includes labor, materials, equipment, mobilization, insurance requirements, exclusions, and your payment terms?");
    expect(body).toContain("I'm collecting quotes before finalizing a bid, so this is a pricing inquiry rather than a commitment to award the work.");
    expect(body).not.toMatch(/\[(project owner|scope of work|location|deadline)\]/);
  });

  it("tailors the quote request to the solicitation's insurance requirement and due date", () => {
    const body = set.scripts.find((s) => s.id === "quote-request")!.body;
    expect(body).toContain("$1,000,000");
    expect(body).toContain("Solicitation D-1 is due November 20, 2026");
    expect(body).toContain("Kingsless LLC");
  });

  it("the procurement inquiry is trimmed to what is still unknown", () => {
    // clean terms: subcontracting allowed and payment known -> the two standard paragraphs are not needed
    const body = set.scripts.find((s) => s.id === "procurement-inquiry")!.body;
    expect(body).not.toContain("whether a prime contractor may use qualified subcontractors");
    expect(body).toContain("Thank you for your guidance.");
  });

  it("with subcontracting and payment unknown, the inquiry contains the owner's exact paragraphs", () => {
    const lamp = TEST_CASE_OPPORTUNITIES.find((o) => o.id === "lamp-rfp-0003")!;
    const a = analyze({ opportunity: lamp, inputs: newInputs() }, w);
    const s = generateScripts(lamp, a, newInputs(), w.settings, TODAY);
    const body = s.scripts.find((x) => x.id === "procurement-inquiry")!.body;
    expect(body).toContain("Hello, I'm reviewing solicitation RFP-0003 for Site Clearing and Mass Grading.");
    expect(body).toContain(
      "Before submitting a proposal, I'd like to confirm whether a prime contractor may use qualified subcontractors to perform some or all of the required scope, and whether any prior-performance, licensing, insurance, bonding, or subcontractor-disclosure requirements apply.",
    );
    expect(body).toContain(
      "Could you also direct me to the applicable contract terms governing invoicing, acceptance, milestone payments, retainage, and payment deadlines?",
    );
  });

  it("holds back subcontractor outreach while a hard gate is still unknown", () => {
    const lamp = TEST_CASE_OPPORTUNITIES.find((o) => o.id === "lamp-rfp-0003")!;
    const s = generateScripts(lamp, analyze({ opportunity: lamp, inputs: newInputs() }, w), newInputs(), w.settings, TODAY);
    expect(s.scripts.map((x) => x.id)).toEqual(["procurement-inquiry"]);
    expect(s.banner).toMatch(/locked/i);
  });

  it("drafts nothing for a rejected opportunity", () => {
    const fw = TEST_CASE_OPPORTUNITIES[0]!;
    const s = generateScripts(fw, analyze({ opportunity: fw, inputs: newInputs() }, w), newInputs(), w.settings, TODAY);
    expect(s.status).toBe("withheld");
    expect(s.scripts).toHaveLength(0);
  });

  it("keeps internal pricing notes out of the customer-facing bid body", () => {
    const bid = set.scripts.find((s) => s.id === "draft-bid")!;
    expect(bid.body).not.toMatch(/walk-away|profit/i);
    expect(bid.internalNotes).toMatch(/INTERNAL ONLY/);
  });

  it("every set is labelled as a draft that is never sent automatically", () => {
    expect(set.status).toBe("draft");
    expect(set.banner).toMatch(/never sends/i);
  });
});
