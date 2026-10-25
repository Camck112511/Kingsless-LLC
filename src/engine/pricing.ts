/**
 * Pricing math. Margin and markup are different things and the engine never mixes them:
 *   margin = profit / price        markup = profit / cost
 * A 10% margin on a $10,000 contract is $1,000 of gross profit BEFORE overhead and tax, not take-home income.
 *
 * PROTECTED engine file.
 */
import type { CostItems, PricingResult } from "./types";
import { round2 } from "./util";

/** markup (profit/cost) -> margin (profit/price). 0.25 markup = 0.20 margin. */
export const marginFromMarkup = (markup: number): number => markup / (1 + markup);

/** margin (profit/price) -> markup (profit/cost). 0.20 margin = 0.25 markup. Margin must be < 1. */
export function markupFromMargin(margin: number): number {
  if (margin >= 1) throw new RangeError("margin must be below 100%");
  return margin / (1 - margin);
}

/** Price that yields `margin` over `costUsd`. */
export function priceForMargin(costUsd: number, margin: number): number {
  if (margin >= 1) throw new RangeError("margin must be below 100%");
  return costUsd / (1 - margin);
}

export const sumCosts = (c: CostItems): number =>
  c.bondPremiumUsd + c.insurancePremiumUsd + c.registrationUsd + c.adminUsd + c.financingUsd + c.otherUsd;

/**
 * The owner's pricing calculator: contract value, subcontractor price, and other estimated costs.
 * Illustrative defaults ($10,000 / $5,700 / $500) give a 38.0% net margin and a 57.0% subcontractor share.
 * Before-tax only. Does not verify contract eligibility or payment terms.
 */
export function calcPricing(contractValueUsd: number, subPriceUsd: number, otherCostsUsd: number): PricingResult {
  for (const [name, v] of Object.entries({ contractValueUsd, subPriceUsd, otherCostsUsd })) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be a non-negative number`);
  }
  const grossSpread = contractValueUsd - subPriceUsd;
  const profit = grossSpread - otherCostsUsd;
  const cost = subPriceUsd + otherCostsUsd;
  const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    contractValueUsd: round2(contractValueUsd),
    subPriceUsd: round2(subPriceUsd),
    otherCostsUsd: round2(otherCostsUsd),
    grossSpreadUsd: round2(grossSpread),
    profitBeforeTaxUsd: round2(profit),
    grossMarginRate: rate(grossSpread, contractValueUsd),
    netMarginRate: rate(profit, contractValueUsd),
    subShareRate: rate(subPriceUsd, contractValueUsd),
    markupOnCostRate: rate(profit, cost),
  };
}

/** Total non-sub cost of a deal: itemised costs plus the overrun cushion on the sub price. */
export const otherCostsFor = (costs: CostItems, subPriceUsd: number, contingencyRate: number): number =>
  sumCosts(costs) + subPriceUsd * contingencyRate;

/** Profit a bid of `bidUsd` must earn: the larger of the dollar floor and the margin floor. */
export const requiredProfit = (bidUsd: number, margin: number, minProfitUsd: number): number =>
  Math.max(minProfitUsd, margin * bidUsd);

/** Lowest price that still earns `margin` and the dollar floor, given total cost. */
export function minPriceFor(totalCostUsd: number, margin: number, minProfitUsd: number): number {
  return Math.max(priceForMargin(totalCostUsd, margin), totalCostUsd + minProfitUsd);
}

/**
 * Highest sub price payable at `bidUsd` that still leaves `requiredProfitUsd`,
 * given fixed costs and a contingency rate applied to the sub price. Never negative.
 */
export function maxSubPriceForProfit(
  bidUsd: number,
  fixedCostsUsd: number,
  contingencyRate: number,
  requiredProfitUsd: number,
): number {
  return Math.max(0, (bidUsd - fixedCostsUsd - requiredProfitUsd) / (1 + contingencyRate));
}
