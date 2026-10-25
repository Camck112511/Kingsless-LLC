import { describe, expect, it } from "vitest";
import { analyze, analyzeAll } from "../analyze";
import { newInputs } from "../factory";
import { TEST_CASE_INPUTS, TEST_CASE_OPPORTUNITIES } from "../seeds";
import type { Gate, GateId } from "../types";
import { cleanOpp, cleanTerms, goodInputs, payWhenPaid, quote, settings, sub, world } from "./helpers";

const gate = (gates: Gate[], id: GateId): Gate => {
  const g = gates.find((x) => x.id === id);
  if (!g) throw new Error(`no gate ${id}`);
  return g;
};

describe("live test cases (as reported 2026-10-25)", () => {
  const byId = (id: string) => {
    const opportunity = TEST_CASE_OPPORTUNITIES.find((o) => o.id === id);
    if (!opportunity) throw new Error(id);
    return analyze({ opportunity, inputs: TEST_CASE_INPUTS[id] ?? newInputs() }, world());
  };

  it("Fort Worth 26-0268 is REJECTED: intermediaries not permitted, no insurance, too little time", () => {
    const a = byId("fw-26-0268");
    expect(a.verdict).toBe("reject");
    expect(gate(a.gates, "subcontracting").status).toBe("fail");
    expect(gate(a.gates, "prime-eligibility").status).toBe("fail");
    expect(gate(a.gates, "deadline").status).toBe("fail");
    expect(a.verdictReason).toMatch(/subcontract/i);
  });

  it("Fort Worth drafts no outreach at all", () => {
    const opportunity = TEST_CASE_OPPORTUNITIES[0]!;
    expect(analyze({ opportunity, inputs: newInputs() }, world()).nextActions[0]).toMatch(/do not pursue/i);
  });

  it("LAMP RFP-0003 (site clearing and grading) is INVESTIGATE, never a recommendation", () => {
    const a = byId("lamp-rfp-0003");
    expect(a.verdict).toBe("investigate");
    expect(a.gates.some((g) => g.status === "fail")).toBe(false);
    expect(gate(a.gates, "subcontracting").status).toBe("unknown");
    expect(gate(a.gates, "financing").status).toBe("unknown");
    expect(gate(a.gates, "payment-timing").status).toBe("unknown");
    expect(a.openQuestions.join(" ")).toMatch(/subcontractors/i);
    expect(a.openQuestions.join(" ")).toMatch(/payment|invoicing|retainage/i);
  });

  it("LAMP RFP-0005 (site security) is INVESTIGATE and raises the guard-licensing question", () => {
    const a = byId("lamp-rfp-0005");
    expect(a.verdict).toBe("investigate");
    const prime = gate(a.gates, "prime-eligibility");
    expect(prime.status).toBe("unknown");
    expect(prime.details.join(" ")).toMatch(/1702|licensed/i);
  });

  it("none of the test cases is marked verified (the portals were unreachable)", () => {
    expect(TEST_CASE_OPPORTUNITIES.every((o) => !o.provenance.verified)).toBe(true);
    expect(byId("lamp-rfp-0003").warnings.join(" ")).toMatch(/not verified/i);
  });
});

describe("the three hard rules", () => {
  it("excellent economics cannot rescue unknown subcontracting rules", () => {
    const opp = cleanOpp({ terms: cleanTerms({ subcontracting: "unknown" }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 1000 }) }, world());
    expect(a.pricing?.netMarginRate).toBeGreaterThan(0.5);
    expect(a.verdict).toBe("investigate");
  });

  it("a 90% margin cannot rescue a subcontracting prohibition", () => {
    const opp = cleanOpp({ terms: cleanTerms({ subcontracting: "prohibited" }) });
    expect(analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 400 }) }, world()).verdict).toBe("reject");
  });

  it("excellent economics cannot rescue a prime who cannot qualify", () => {
    const opp = cleanOpp({ terms: cleanTerms({ setAside: "8a" }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs() }, world());
    expect(gate(a.gates, "prime-eligibility").status).toBe("fail");
    expect(a.verdict).toBe("reject");
  });

  it("the same opportunity qualifies once the company holds the certification", () => {
    const opp = cleanOpp({ terms: cleanTerms({ setAside: "8a" }) });
    const w = world({ settings: settings({ profile: { ...settings().profile, certifications: ["8a"] } }) });
    // sub share kept under the default set-aside subcontracting limit so only eligibility is being tested
    expect(analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 1500 }) }, w).verdict).toBe("qualified");
  });

  it("a $12,000 upfront obligation fails financing against $300 even at a 20% margin", () => {
    const a = analyze(
      { opportunity: cleanOpp({ durationDays: 60 }), inputs: goodInputs({ marketPriceUsd: 60_000, subPriceEstimateUsd: 40_000, costs: { ...newInputs().costs, bondPremiumUsd: 12_000 } }) },
      world(),
    );
    expect(gate(a.gates, "financing").status).toBe("fail");
    expect(a.verdict).toBe("reject");
  });

  it("a 20% margin does not help when sub terms are unknown and the deposit would exceed capital", () => {
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs({ subTerms: null }) }, world());
    expect(gate(a.gates, "financing").status).toBe("unknown");
    expect(a.verdict).toBe("investigate");
  });
});

describe("verdict ladder", () => {
  it("qualified when every gate passes under cautious assumptions", () => {
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, world());
    expect(a.gates.map((g) => g.status)).toEqual(["pass", "pass", "pass", "pass", "pass", "pass"]);
    expect(a.verdict).toBe("qualified");
    expect(a.cash?.peakCashRequiredUsd).toBe(0);
  });

  it("bid-ready only with a firm quote from a sub that is at least partially verified", () => {
    const opp = cleanOpp();
    const base = { opportunity: opp, inputs: goodInputs() };
    const withQuote = world({ quotes: [quote()], subcontractors: [sub({ willingToSubcontract: "yes" })] });
    expect(analyze(base, withQuote).verdict).toBe("bid-ready");

    // same quote, but the company is unverified (no willingness, nothing confirmed)
    const unverified = world({ quotes: [quote({ firm: true })], subcontractors: [sub({ services: ["roofing"], willingToSubcontract: "unknown" })] });
    const a = analyze(base, unverified);
    expect(a.verdict).toBe("qualified");
  });

  it("an expired firm quote falls back to the estimate", () => {
    const a = analyze(
      { opportunity: cleanOpp(), inputs: goodInputs() },
      world({ quotes: [quote({ validUntil: "2026-10-01" })], subcontractors: [sub({ willingToSubcontract: "yes" })] }),
    );
    expect(a.subPriceBasis).toBe("estimate");
  });

  it("a past due date is a hard stop", () => {
    const a = analyze({ opportunity: cleanOpp({ dueDate: "2026-10-01" }), inputs: goodInputs() }, world());
    expect(gate(a.gates, "deadline").status).toBe("fail");
    expect(a.verdict).toBe("reject");
  });

  it("a payment clause that pays too late fails the timing gate", () => {
    const opp = cleanOpp({ terms: cleanTerms({ paymentNetDays: 90 }) });
    expect(gate(analyze({ opportunity: opp, inputs: goodInputs() }, world()).gates, "payment-timing").status).toBe("fail");
  });

  it("small-business set-aside caps subcontracting; a high sub share needs similarly situated subs", () => {
    const opp = cleanOpp({ terms: cleanTerms({ setAside: "small-business", subcontracting: "allowed" }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 2900 }) }, world());
    const g = gate(a.gates, "subcontracting");
    expect(g.status).toBe("unknown");
    expect(g.details.join(" ")).toMatch(/125\.6/);
  });

  it("an explicit cap that the plan exceeds does not pass", () => {
    const opp = cleanOpp({ terms: cleanTerms({ subcontracting: "limited", subcontractShareCap: 0.5 }) });
    const a = analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 2900 }) }, world());
    expect(gate(a.gates, "subcontracting").status).not.toBe("pass");
    const ok = analyze({ opportunity: opp, inputs: goodInputs({ subPriceEstimateUsd: 1500 }) }, world());
    expect(gate(ok.gates, "subcontracting").status).toBe("pass");
  });
});

describe("three prices", () => {
  const s = settings({ availableCapitalUsd: 100_000 });
  const inputs = newInputs({ marketPriceUsd: 10_000, subPriceEstimateUsd: 5_700, subTerms: payWhenPaid, costs: { ...newInputs().costs, adminUsd: 500 } });
  const a = analyze({ opportunity: cleanOpp({ durationDays: 30 }), inputs }, world({ settings: s }));

  it("walk-away covers the cautious sub price at the floor margin", () => {
    const costCons = 5_700 * 1.25 * 1.05 + 500;
    expect(a.prices.walkAwayPriceUsd).toBeCloseTo(Math.max(costCons / 0.9, costCons + 250), 1);
  });

  it("target bid earns the target margin on the cautious cost and sits under the market price", () => {
    const costCons = 5_700 * 1.25 * 1.05 + 500;
    expect(a.prices.targetBidUsd).toBeCloseTo(costCons / 0.8, 1);
    expect(a.prices.targetBidUsd!).toBeLessThanOrEqual(10_000);
    expect(a.prices.targetBidUsd!).toBeGreaterThanOrEqual(a.prices.walkAwayPriceUsd!);
  });

  it("max sub price leaves exactly the required profit at the working bid", () => {
    const s2 = a.prices.maxSubPriceUsd!;
    const profit = 10_000 - 500 - s2 * 1.05;
    expect(profit).toBeCloseTo(Math.max(250, 0.1 * 10_000), 1);
  });

  it("max sub price shrinks to what capital can finance when sub terms are cautious", () => {
    const tight = analyze(
      { opportunity: cleanOpp({ durationDays: 30 }), inputs: { ...inputs, subTerms: { kind: "deposit-balance", depositRate: 0.3, netDays: 0 } } },
      world({ settings: settings({ availableCapitalUsd: 1_000 }) }),
    );
    expect(tight.prices.maxSubPriceUsd!).toBeLessThan(a.prices.maxSubPriceUsd!);
    expect(tight.prices.maxSubPriceUsd!).toBeLessThanOrEqual(1_000 - 500 + 1);
  });

  it("flags when even the walk-away exceeds the market", () => {
    const t = analyze({ opportunity: cleanOpp(), inputs: goodInputs({ marketPriceUsd: 2_000, subPriceEstimateUsd: 2_100 }) }, world());
    expect(t.prices.notes.join(" ")).toMatch(/exceeds the expected market price/);
    expect(gate(t.gates, "margin").status).toBe("fail");
  });

  it("returns nulls, not guesses, when nothing is known", () => {
    const n = analyze({ opportunity: cleanOpp(), inputs: newInputs() }, world());
    expect(n.prices.targetBidUsd).toBeNull();
    expect(n.prices.maxSubPriceUsd).toBeNull();
    expect(n.prices.walkAwayPriceUsd).toBeNull();
  });
});

describe("ranking", () => {
  it("a $4,000 job with no upfront cash outranks a $40,000 job that needs $12,000 first", () => {
    const small = cleanOpp({ id: "small", title: "Small" });
    const big = cleanOpp({ id: "big", title: "Big" });
    const w = world(); // default $300 of capital
    const ranked = analyzeAll(
      [
        { opportunity: big, inputs: newInputs({ marketPriceUsd: 40_000, subPriceEstimateUsd: 12_000, subTerms: { kind: "deposit-balance", depositRate: 1, netDays: 0 } }) },
        { opportunity: small, inputs: goodInputs() },
      ],
      w,
    );
    expect(ranked[0]?.opportunityId).toBe("small");
    expect(ranked[0]?.verdict).toBe("qualified");
    expect(ranked[1]?.opportunityId).toBe("big");
    expect(ranked[1]?.verdict).toBe("reject"); // $12,000 up front against $300
  });

  it("within a verdict tier, less cash and faster payment beat raw profit", () => {
    const w = world({ settings: settings({ availableCapitalUsd: 5_000 }) });
    const lean = { opportunity: cleanOpp({ id: "lean" }), inputs: goodInputs({ marketPriceUsd: 6_000, subPriceEstimateUsd: 3_500 }) };
    const heavy = {
      opportunity: cleanOpp({ id: "heavy" }),
      inputs: goodInputs({ marketPriceUsd: 7_000, subPriceEstimateUsd: 3_500, subTerms: { kind: "net", depositRate: 0, netDays: 30 } }),
    };
    const [first] = analyzeAll([heavy, lean], w);
    expect(first?.opportunityId).toBe("lean");
  });

  it("orders tiers bid-ready, qualified, investigate, reject and breaks ties by due date", () => {
    const items = [
      { opportunity: cleanOpp({ id: "rej", terms: cleanTerms({ subcontracting: "prohibited" }) }), inputs: goodInputs() },
      { opportunity: cleanOpp({ id: "inv-late", terms: cleanTerms({ subcontracting: "unknown" }), dueDate: "2026-12-01" }), inputs: newInputs() },
      { opportunity: cleanOpp({ id: "inv-soon", terms: cleanTerms({ subcontracting: "unknown" }), dueDate: "2026-11-15" }), inputs: newInputs() },
      { opportunity: cleanOpp({ id: "qual" }), inputs: goodInputs() },
    ];
    expect(analyzeAll(items, world()).map((a) => a.opportunityId)).toEqual(["qual", "inv-soon", "inv-late", "rej"]);
  });
});

describe("win probability", () => {
  it("is bounded and explains itself", () => {
    const a = analyze({ opportunity: cleanOpp({ terms: cleanTerms({ pastPerformance: "scored", rapidTurnaround: "yes" }) }), inputs: goodInputs() }, world());
    expect(a.winProbability.value).toBeGreaterThanOrEqual(0.01);
    expect(a.winProbability.value).toBeLessThanOrEqual(0.6);
    expect(a.winProbability.factors.map((f) => f.label)).toContain("Past performance is scored");
    expect(a.winProbability.note).toMatch(/heuristic/i);
  });

  it("expected profit is probability-weighted, not the full profit", () => {
    const a = analyze({ opportunity: cleanOpp(), inputs: goodInputs() }, world());
    expect(a.expectedProfitUsd!).toBeLessThan(a.pricing!.profitBeforeTaxUsd);
    expect(a.expectedProfitUsd!).toBeCloseTo(a.winProbability.value * a.pricing!.profitBeforeTaxUsd, 1);
  });
});
