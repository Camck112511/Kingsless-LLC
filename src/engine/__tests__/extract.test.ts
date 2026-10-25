import { describe, expect, it } from "vitest";
import { mergeAiFacts, quoteAppearsIn } from "../ai-merge";
import { applyPatch, extractTerms, parseDate } from "../extract";
import { newTerms } from "../factory";

describe("rule-based extraction", () => {
  it("reads the Fort Worth style listing: intermediaries prohibited, insurance, scored past performance, rapid shipping", () => {
    const t = extractTerms(
      "Intermediaries are not permitted. Proposers must carry substantial insurance. Past performance will be scored. The City expects quick quotes and rapid shipping.",
    );
    expect(t.subcontracting).toBe("prohibited");
    expect(t.insuranceRequired).toBe("yes");
    expect(t.pastPerformance).toBe("scored");
    expect(t.rapidTurnaround).toBe("yes");
    expect(t.evidence?.subcontracting?.[0]).toContain("Intermediaries are not permitted");
  });

  it("treats prohibition-with-approval as limited, not prohibited", () => {
    const t = extractTerms("The Contractor shall not subcontract any portion of the work without the prior written approval of the Owner.");
    expect(t.subcontracting).toBe("limited");
  });

  it("unconditional prohibition wins over a permissive sentence", () => {
    const t = extractTerms("The prime may use subcontractors for deliveries. Subcontracting of the core scope is prohibited.");
    expect(t.subcontracting).toBe("prohibited");
  });

  it("detects permission", () => {
    expect(extractTerms("Prime contractors may use qualified subcontractors to perform the work.").subcontracting).toBe("allowed");
  });

  it("derives a cap from the federal limitation-on-subcontracting wording (FAR 52.219-14)", () => {
    const t = extractTerms(
      "In accordance with 52.219-14 Limitations on Subcontracting, the Contractor will not pay more than 50 percent of the amount paid by the Government for contract performance to subcontractors that are not similarly situated entities.",
    );
    expect(t.subcontracting).toBe("limited");
    expect(t.subcontractShareCap).toBe(0.5);
  });

  it("derives a cap from a minimum self-performance requirement", () => {
    const t = extractTerms("The offeror must perform at least 15% of the cost of the contract with its own employees.");
    expect(t.subcontractShareCap).toBeCloseTo(0.85, 6);
  });

  it("stays silent (unknown) when the text says nothing", () => {
    const t = extractTerms("The contractor shall provide site clearing and grading services.");
    expect(t.subcontracting).toBeUndefined();
    expect(t.paymentKind).toBeUndefined();
    expect(t.insuranceRequired).toBeUndefined();
  });

  it("extracts payment terms, retainage and acceptance", () => {
    const t = extractTerms(
      "Payment shall be made within 30 days of receipt of a correct invoice. Progress payments will be made monthly. The Owner will retain 10% of each progress payment until final completion. The Owner will review and accept deliverables within 14 days.",
    );
    expect(t.paymentNetDays).toBe(30);
    expect(t.paymentKind).toBe("progress");
    expect(t.invoiceCycleDays).toBe(30);
    expect(t.retainageRate).toBeCloseTo(0.1, 6);
    expect(t.acceptanceDays).toBe(14);
  });

  it("reads 'net 45' and falls back to net-after-invoice", () => {
    const t = extractTerms("Invoices are payable net 45.");
    expect(t.paymentNetDays).toBe(45);
    expect(t.paymentKind).toBe("net-after-invoice");
  });

  it("extracts bonds, with negation", () => {
    const t = extractTerms("A bid bond of 5% is required. A performance bond is required. A payment bond is not required.");
    expect(t.bidBond).toBe("yes");
    expect(t.performanceBond).toBe("yes");
    expect(t.paymentBond).toBe("no");
  });

  it("extracts the largest insurance limit", () => {
    const t = extractTerms("The Contractor shall maintain commercial general liability insurance of $1,000,000 per occurrence and $2,000,000 aggregate.");
    expect(t.insuranceRequired).toBe("yes");
    expect(t.insuranceMinLimitUsd).toBe(2_000_000);
  });

  it("extracts licensing, a mandatory pre-bid meeting with its date, and experience in words", () => {
    const t = extractTerms(
      "Guards must hold a valid license under Chapter 1702. A mandatory pre-bid meeting will be held on October 22, 2026. Proposers must have at least five years of experience providing similar products.",
    );
    expect(t.licensingRequired).toBe("yes");
    expect(t.mandatoryPreBid).toBe("yes");
    expect(t.preBidDate).toBe("2026-10-22");
    expect(t.minYearsExperience).toBe(5);
  });

  it("only reads a set-aside from a sentence that mentions set-asides", () => {
    expect(extractTerms("This is a total small business set-aside.").setAside).toBe("small-business");
    expect(extractTerms("This acquisition is a set-aside for HUBZone small business concerns.").setAside).toBe("hubzone");
    expect(extractTerms("Our small business program helps vendors.").setAside).toBeUndefined();
  });

  it("parses dates", () => {
    expect(parseDate("10/22/2026")).toBe("2026-10-22");
    expect(parseDate("March 3, 2027")).toBe("2027-03-03");
    expect(parseDate("soon")).toBeNull();
  });

  it("applyPatch never overwrites a value the admin already set", () => {
    const base = newTerms({ subcontracting: "allowed" });
    const next = applyPatch(base, extractTerms("Subcontracting is prohibited."));
    expect(next.subcontracting).toBe("allowed");
    expect(applyPatch(base, extractTerms("Subcontracting is prohibited."), { overwrite: true }).subcontracting).toBe("prohibited");
  });
});

describe("AI facts are only accepted with a verbatim quote", () => {
  const text = "Section 4.2: Subcontracting is permitted with disclosure. Payment is due net 45 after acceptance.";

  it("accepts a fact whose quote appears in the document", () => {
    const r = mergeAiFacts(newTerms(), [{ field: "paymentNetDays", value: "45", quote: "Payment is due net 45 after acceptance." }], text);
    expect(r.terms.paymentNetDays).toBe(45);
    expect(r.accepted).toHaveLength(1);
    expect(r.terms.evidence.paymentNetDays?.[0]).toContain("AI:");
  });

  it("rejects a fabricated quote", () => {
    const r = mergeAiFacts(newTerms(), [{ field: "subcontracting", value: "allowed", quote: "Subcontracting is freely permitted without limit." }], text);
    expect(r.terms.subcontracting).toBe("unknown");
    expect(r.rejected[0]?.reason).toMatch(/verbatim/);
  });

  it("rejects unknown fields and invalid values", () => {
    const r = mergeAiFacts(
      newTerms(),
      [
        { field: "winProbability", value: "0.9", quote: "Subcontracting is permitted with disclosure." },
        { field: "retainageRate", value: "10", quote: "Subcontracting is permitted with disclosure." },
      ],
      text,
    );
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(2);
  });

  it("a stricter AI reading overrides, a looser one does not", () => {
    const strict = mergeAiFacts(newTerms({ subcontracting: "allowed" }), [{ field: "subcontracting", value: "prohibited", quote: "Subcontracting is permitted with disclosure." }], text);
    expect(strict.terms.subcontracting).toBe("prohibited");
    expect(strict.conflicts.length).toBe(1);

    const loose = mergeAiFacts(newTerms({ subcontracting: "prohibited" }), [{ field: "subcontracting", value: "allowed", quote: "Subcontracting is permitted with disclosure." }], text);
    expect(loose.terms.subcontracting).toBe("prohibited");
    expect(loose.conflicts.length).toBe(1);
  });

  it("ignores whitespace and curly-quote differences when checking quotes", () => {
    expect(quoteAppearsIn("Payment is due   net 45", text)).toBe(true);
    expect(quoteAppearsIn("it’s fine", "It's   fine and dandy")).toBe(false); // too short to count as evidence
  });
});
