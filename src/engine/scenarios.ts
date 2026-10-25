/**
 * Turns partial knowledge into three consistent economic pictures: optimistic, base and conservative.
 *
 * Known facts (a firm quote, a stated payment clause) are identical in all three. Unknowns take the assumptions in
 * RULES. Gates then ask: does it work even in the conservative case (pass)? Does it fail even in the optimistic one (fail)?
 * Anything in between is `unknown`: worth investigating, never worth recommending.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import { simulateCash, type CashPlan, type CustomerTerms } from "./cashflow";
import { calcPricing, maxSubPriceForProfit, minPriceFor, otherCostsFor, requiredProfit, sumCosts } from "./pricing";
import type { Inputs, Opportunity, Prices, Quote, ScenarioResult, Settings, SubTerms } from "./types";
import { daysBetween, isIsoDate, round2, usd } from "./util";

export type ScenarioName = "optimistic" | "base" | "conservative";

export interface Evaluated {
  optimistic: ScenarioResult;
  base: ScenarioResult;
  conservative: ScenarioResult;
  subPriceBasis: "firm-quote" | "estimate" | "none";
  /** Quote the sub price came from, if any. */
  usedQuote: Quote | null;
  marketPriceUsd: number | null;
  /** Bid used to compute margins: planned bid, else market price. */
  workingBidUsd: number | null;
  customerTermsKnown: boolean;
  subTermsKnown: boolean;
}

export interface SubPriceInfo {
  basis: "firm-quote" | "estimate" | "none";
  low: number | null;
  mid: number | null;
  high: number | null;
  terms: SubTerms | null;
  quote: Quote | null;
}

export function quoteIsUsable(q: Quote, today: string): boolean {
  if (!q.firm || !q.scopeMatched || !(q.amountUsd > 0)) return false;
  if (isIsoDate(q.validUntil)) return daysBetween(today, q.validUntil) >= 0;
  return isIsoDate(q.receivedOn) ? daysBetween(q.receivedOn, today) <= RULES.quoteDefaultValidDays : false;
}

export function resolveSubPrice(inputs: Inputs, quotes: Quote[], today: string): SubPriceInfo {
  const usable = quotes.filter((q) => quoteIsUsable(q, today)).sort((a, b) => a.amountUsd - b.amountUsd);
  const best = usable[0];
  if (best) {
    return { basis: "firm-quote", low: best.amountUsd, mid: best.amountUsd, high: best.amountUsd, terms: best.terms, quote: best };
  }
  const est = inputs.subPriceEstimateUsd;
  if (est !== null && est > 0) {
    return {
      basis: "estimate",
      low: est * (1 - RULES.estimateBand.lowRate),
      mid: est,
      high: est * (1 + RULES.estimateBand.highRate),
      terms: inputs.subTerms,
      quote: null,
    };
  }
  return { basis: "none", low: null, mid: null, high: null, terms: inputs.subTerms, quote: null };
}

export function marketPrice(opp: Opportunity, inputs: Inputs): number | null {
  if (inputs.marketPriceUsd !== null && inputs.marketPriceUsd > 0) return inputs.marketPriceUsd;
  const { low, high } = opp.valueEstimate;
  if (low !== null && high !== null) return (low + high) / 2;
  return high ?? low ?? null;
}

function customerTerms(opp: Opportunity, name: ScenarioName): { terms: CustomerTerms; known: boolean } {
  const t = opp.terms;
  const known = t.paymentKind !== "unknown" && t.paymentNetDays !== null;
  if (known) {
    return {
      known,
      terms: {
        kind: t.paymentKind as CustomerTerms["kind"],
        netDays: t.paymentNetDays ?? 0,
        invoiceCycleDays: t.invoiceCycleDays ?? RULES.defaultInvoiceCycleDays,
        retainageRate: t.retainageRate ?? 0,
        acceptanceDays: t.acceptanceDays ?? 0,
      },
    };
  }
  const a = RULES.customerTermsAssumed[name];
  return {
    known,
    terms: {
      kind: a.paymentKind,
      netDays: a.paymentNetDays,
      invoiceCycleDays: RULES.defaultInvoiceCycleDays,
      retainageRate: t.retainageRate ?? 0,
      acceptanceDays: a.acceptanceDays,
    },
  };
}

export function durationFor(opp: Opportunity, inputs: Inputs, name: ScenarioName): number {
  return inputs.durationDays ?? opp.durationDays ?? RULES.durationDaysAssumed[name];
}

export function evaluateScenarios(opp: Opportunity, inputs: Inputs, quotes: Quote[], settings: Settings, today: string): Evaluated {
  const sp = resolveSubPrice(inputs, quotes, today);
  const market = marketPrice(opp, inputs);
  const bid = inputs.plannedBidUsd !== null && inputs.plannedBidUsd > 0 ? inputs.plannedBidUsd : market;
  const fixed = sumCosts(inputs.costs);
  const upfront = fixed + settings.bidPrepCostUsd;
  const subKnown = sp.terms !== null;

  const run = (name: ScenarioName, subPrice: number | null): ScenarioResult => {
    if (subPrice === null || bid === null) return { name, subPriceUsd: subPrice === null ? null : round2(subPrice), pricing: null, cash: null };
    const cust = customerTerms(opp, name);
    const plan: CashPlan = {
      customerPriceUsd: bid,
      subPriceUsd: subPrice,
      upfrontCostsUsd: upfront,
      startLeadDays: inputs.startLeadDays,
      durationDays: durationFor(opp, inputs, name),
      customer: cust.terms,
      sub: sp.terms ?? RULES.subTermsAssumed[name],
    };
    return {
      name,
      subPriceUsd: round2(subPrice),
      pricing: calcPricing(bid, subPrice, otherCostsFor(inputs.costs, subPrice, settings.contingencyRate)),
      cash: simulateCash(plan),
    };
  };

  return {
    optimistic: run("optimistic", sp.low),
    base: run("base", sp.mid),
    conservative: run("conservative", sp.high),
    subPriceBasis: sp.basis,
    usedQuote: sp.quote,
    marketPriceUsd: market,
    workingBidUsd: bid,
    customerTermsKnown: opp.terms.paymentKind !== "unknown" && opp.terms.paymentNetDays !== null,
    subTermsKnown: subKnown,
  };
}

/** Largest sub price whose peak cash need still fits `capital`, found by bisection (peak cash only grows with sub price). */
function maxSubForCash(basePlan: Omit<CashPlan, "subPriceUsd">, upper: number, capital: number): number {
  const fits = (s: number) => simulateCash({ ...basePlan, subPriceUsd: s }).peakCashRequiredUsd <= capital + 1e-9;
  if (fits(upper)) return upper;
  if (!fits(0)) return 0;
  let lo = 0;
  let hi = upper;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function computePrices(
  opp: Opportunity,
  inputs: Inputs,
  settings: Settings,
  ev: Evaluated,
  today: string,
  quotes: Quote[],
): Prices {
  const notes: string[] = [];
  const sp = resolveSubPrice(inputs, quotes, today);
  const fixed = sumCosts(inputs.costs);
  const c = settings.contingencyRate;
  const M = ev.marketPriceUsd;

  let walkAway: number | null = null;
  let target: number | null = null;
  if (sp.mid !== null && sp.high !== null) {
    // Prices are built on the cautious end of the sub price. A firm quote collapses the band, so the prices tighten
    // automatically once a quote arrives.
    const costCons = sp.high * (1 + c) + fixed;
    walkAway = minPriceFor(costCons, settings.walkAwayMargin, settings.minProfitUsd);
    const costBased = minPriceFor(costCons, settings.targetMargin, settings.minProfitUsd);
    target = Math.max(walkAway, M !== null ? Math.min(costBased, M) : costBased);
    if (M === null) notes.push("No market price anchor: the target is cost-plus only, so competitiveness cannot be judged.");
    else if (walkAway > M) notes.push(`Even the walk-away price exceeds the expected market price (${usd(M)}); a competitive bid would lose money.`);
    else if (costBased < M) notes.push(`Pricing up toward the expected market price (${usd(M)}) would raise profit at a lower chance of winning.`);
    if (sp.basis === "estimate") notes.push("Built on the cautious end of your sub-price estimate; get a firm quote to tighten these numbers.");
  } else {
    notes.push("Enter a subcontractor price estimate (or get a quote) to compute the target bid and walk-away price.");
  }

  const W = ev.workingBidUsd ?? target;
  let maxSub: number | null = null;
  if (W !== null) {
    const need = requiredProfit(W, settings.walkAwayMargin, settings.minProfitUsd);
    const byMargin = maxSubPriceForProfit(W, fixed, c, need);
    maxSub = byMargin;
    let binding = "margin";

    const cust = customerTerms(opp, "conservative").terms;
    const plan: Omit<CashPlan, "subPriceUsd"> = {
      customerPriceUsd: W,
      upfrontCostsUsd: fixed + settings.bidPrepCostUsd,
      startLeadDays: inputs.startLeadDays,
      durationDays: durationFor(opp, inputs, "conservative"),
      customer: cust,
      sub: sp.terms ?? RULES.subTermsAssumed.conservative,
    };
    const byCash = maxSubForCash(plan, byMargin, settings.availableCapitalUsd);
    if (byCash < maxSub) {
      maxSub = byCash;
      binding = "cash";
    }
    if (opp.terms.subcontractShareCap !== null) {
      const byCap = opp.terms.subcontractShareCap * W;
      if (byCap < maxSub) {
        maxSub = byCap;
        binding = "subcontracting cap";
      }
    }
    notes.push(`Max sub price is computed at a ${usd(W)} bid and is limited by ${binding}.`);
    if (!ev.subTermsKnown) notes.push("Cash limit assumes cautious sub terms (30% deposit, balance on completion). Pay-when-paid raises it.");
  } else {
    notes.push("Enter a market price or planned bid to compute the maximum subcontractor price.");
  }

  return {
    targetBidUsd: target === null ? null : round2(target),
    maxSubPriceUsd: maxSub === null ? null : round2(maxSub),
    walkAwayPriceUsd: walkAway === null ? null : round2(walkAway),
    notes,
  };
}
