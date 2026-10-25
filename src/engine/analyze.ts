/**
 * The engine's single entry point: facts in, verdict + numbers + next steps out.
 *
 * Verdicts
 *   reject       a gate is PROVEN to fail under current rules
 *   investigate  nothing has failed, but at least one gate cannot be proven (never a bid recommendation)
 *   qualified    every gate passes, even under cautious assumptions; get firm quotes next
 *   bid-ready    every gate passes AND a firm quote from a (at least partially) verified sub backs the numbers
 *
 * PROTECTED engine file.
 */
import { ENGINE_VERSION, RULES, VERDICT_TIER } from "./config";
import {
  deadlineGate,
  financingGate,
  marginGate,
  paymentTimingGate,
  primeEligibilityGate,
  subcontractingGate,
  type GateContext,
} from "./gates";
import { computePrices, evaluateScenarios } from "./scenarios";
import { shortlist } from "./subs";
import type { Analysis, Gate, Inputs, Opportunity, Quote, Settings, Subcontractor, Verdict } from "./types";
import { daysBetween, isIsoDate, round2, unique } from "./util";
import { estimateWinProbability } from "./winprob";

export interface AnalyzeItem {
  opportunity: Opportunity;
  inputs: Inputs;
}

export interface World {
  settings: Settings;
  subcontractors: Subcontractor[];
  quotes: Quote[];
  today: string;
}

const GATE_ORDER = ["subcontracting", "prime-eligibility", "financing", "margin", "payment-timing", "deadline"];

export function analyze(item: AnalyzeItem, world: World): Analysis {
  const { opportunity: opp, inputs } = item;
  const { settings, today } = world;
  const quotes = world.quotes.filter((q) => q.opportunityId === opp.id);

  const ev = evaluateScenarios(opp, inputs, quotes, settings, today);
  const prices = computePrices(opp, inputs, settings, ev, today, quotes);

  const ctx: GateContext = {
    opp,
    settings,
    today,
    scenarios: ev,
    plannedSubShare: ev.conservative.pricing ? ev.conservative.pricing.subShareRate : null,
  };
  const gates: Gate[] = [
    subcontractingGate(ctx),
    primeEligibilityGate(ctx),
    financingGate(ctx),
    marginGate(ctx),
    paymentTimingGate(ctx),
    deadlineGate(ctx),
  ].sort((a, b) => GATE_ORDER.indexOf(a.id) - GATE_ORDER.indexOf(b.id));

  const candidates = shortlist(opp, world.subcontractors, quotes, prices.maxSubPriceUsd, today);
  const quotedSub = ev.usedQuote ? candidates.find((c) => c.subcontractorId === ev.usedQuote?.subcontractorId) : undefined;
  // A quote alone is not enough: the sub must also have confirmed it will work under your subcontract agreement.
  const quoteBacked =
    ev.subPriceBasis === "firm-quote" &&
    quotedSub !== undefined &&
    quotedSub.checks.find((c) => c.id === "willing")?.ok === true &&
    ev.subTermsKnown;

  const failed = gates.filter((g) => g.status === "fail");
  const unknown = gates.filter((g) => g.status === "unknown");
  let verdict: Verdict;
  let verdictReason: string;
  if (failed.length > 0) {
    verdict = "reject";
    const lead = failed.find((g) => g.hard) ?? failed[0]!;
    verdictReason = `Rejected under current rules. ${lead.label}: ${lead.summary}`;
  } else if (unknown.length > 0) {
    verdict = "investigate";
    verdictReason = `Not recommendable yet. Cannot prove: ${unknown.map((g) => g.label.toLowerCase()).join("; ")}.`;
  } else if (quoteBacked) {
    verdict = "bid-ready";
    verdictReason = "Every gate passes on a firm quote from a subcontractor who confirmed they will work under your agreement. The decision to bid is yours.";
  } else {
    verdict = "qualified";
    verdictReason = "Every gate passes, even under cautious assumptions. Get firm quotes to confirm the numbers before bidding.";
  }

  const daysToDeadline = isIsoDate(opp.dueDate) ? daysBetween(today, opp.dueDate) : null;
  const win = estimateWinProbability(opp, settings, {
    // Same price the economics use, so expected profit = P(win at this price) x profit at this price.
    bidUsd: ev.workingBidUsd,
    marketUsd: ev.marketPriceUsd,
    hasFirmQuote: ev.subPriceBasis === "firm-quote",
    daysToDeadline,
  });

  const basePricing = ev.base.pricing;
  const expectedProfitUsd = basePricing ? round2(win.value * basePricing.profitBeforeTaxUsd - settings.bidPrepCostUsd) : null;
  const cash = ev.base.cash;

  let score: number | null = null;
  if (expectedProfitUsd !== null && cash) {
    const timeFactor = 1 / (1 + cash.daysToFirstPayment / RULES.ranking.paymentHorizonDays);
    const capitalFactor = 1 / (1 + cash.peakCashRequiredUsd / Math.max(settings.availableCapitalUsd, 1));
    score = round2(expectedProfitUsd * timeFactor * capitalFactor);
  }

  const warnings: string[] = [];
  if (!opp.provenance.verified) warnings.push(`Listing facts are not verified against the official portal. ${opp.provenance.note}`.trim());
  if (opp.terms.rapidTurnaround === "yes") warnings.push("Quick-quote / rapid-delivery language: hard to promise through a subcontractor.");
  if (ev.subPriceBasis === "estimate") warnings.push("Sub price is your estimate, not a quote. Treat all numbers as provisional.");
  if (ev.subPriceBasis === "firm-quote" && !quoteBacked) warnings.push("A firm quote exists, but its sub has not confirmed willingness to work under your subcontract (or its payment terms are unknown), so this stays qualified, not bid-ready.");

  const hardGateOpen = unknown.some((g) => g.hard && g.id !== "financing");
  const nextActions = nextStepsFor(verdict, gates, ev.subPriceBasis, candidates.length, hardGateOpen);

  return {
    opportunityId: opp.id,
    asOf: today,
    engineVersion: ENGINE_VERSION,
    verdict,
    verdictReason,
    gates,
    openQuestions: unique(unknown.flatMap((g) => g.questions)),
    warnings,
    nextActions,
    subPriceBasis: ev.subPriceBasis,
    marketPriceUsd: ev.marketPriceUsd,
    prices,
    scenarios: [ev.optimistic, ev.base, ev.conservative],
    pricing: basePricing,
    cash,
    winProbability: win,
    expectedProfitUsd,
    daysToDeadline,
    rank: { tier: VERDICT_TIER[verdict], score },
    candidates,
  };
}

function nextStepsFor(verdict: Verdict, gates: Gate[], basis: Analysis["subPriceBasis"], candidateCount: number, hardGateOpen: boolean): string[] {
  const failed = gates.filter((g) => g.status === "fail");
  const unknown = gates.filter((g) => g.status === "unknown");
  switch (verdict) {
    case "reject": {
      const fixes = unique(failed.flatMap((g) => (g.fixableBy ? [g.fixableBy] : [])));
      return [
        "Do not pursue under current rules.",
        ...(fixes.length ? [`This could change if you: ${fixes.join(" ")}`] : []),
        "Use it only as a test case, or to study who the prime contractors are.",
      ];
    }
    case "investigate":
      return [
        hardGateOpen
          ? "Send the procurement inquiry (below) and wait for answers. Do not contact subcontractors yet."
          : "The hard rules hold. Request firm sub quotes to settle the open economics.",
        ...unknown.map((g) => `Resolve: ${g.label}.`),
        "Enter the expected contract value and a sub-price estimate to size the economics.",
      ];
    case "qualified":
      return [
        candidateCount > 0 ? "Request firm quotes from the shortlisted subcontractors (script below)." : "Add subcontractors to your directory and request firm quotes (script below).",
        "Ask each sub to confirm: willingness to subcontract, deposit, and whether pay-when-paid is acceptable.",
        "Re-run the analysis with the quotes entered.",
      ];
    case "bid-ready":
      return [
        "Review the draft bid and the scope-of-work package.",
        "Confirm the subcontract agreement terms with the quoted sub in writing.",
        basis === "firm-quote" ? "Approve the opportunity and submit before the due date." : "Obtain a firm quote before bidding.",
      ];
  }
}

/** Analyze many items and sort: verdict tier, then rank score (best first), then soonest due date. */
export function analyzeAll(items: AnalyzeItem[], world: World): Analysis[] {
  const dueOf = new Map(items.map((i) => [i.opportunity.id, i.opportunity.dueDate ?? "9999-12-31"]));
  return items.map((i) => analyze(i, world)).sort((a, b) => {
    if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
    const sa = a.rank.score;
    const sb = b.rank.score;
    if (sa !== null && sb !== null && sa !== sb) return sb - sa;
    if (sa !== null && sb === null) return -1;
    if (sa === null && sb !== null) return 1;
    return (dueOf.get(a.opportunityId) ?? "").localeCompare(dueOf.get(b.opportunityId) ?? "");
  });
}

