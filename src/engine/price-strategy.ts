/**
 * Picks the bid price that best balances winning against profit, inside limits the owner set.
 *
 * For every candidate price between the lowest viable price and the ceiling, the engine runs the full analysis (so every
 * rule is re-checked at that price) and keeps the one with the highest EXPECTED profit = win chance x profit. The win
 * chance is the engine's transparent heuristic, so the choice is as good as that heuristic: it is shown, not hidden, and
 * should be calibrated from real results. A price that would fail any rule, or sits below the walk-away line, is never chosen.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import { analyze, type AnalyzeItem, type World } from "./analyze";
import { marketPrice } from "./scenarios";
import type { PriceChoice } from "./types";
import { round2, usd } from "./util";

export interface PriceBounds {
  /** Never go below. null = only the walk-away price. */
  floorUsd: number | null;
  /** Never go above. null = the expected market price. */
  ceilingUsd: number | null;
}

export type PriceResult = { choice: PriceChoice; reason?: undefined } | { choice: null; reason: string };

export function recommendPrice(item: AnalyzeItem, world: World, bounds: PriceBounds): PriceResult {
  const { opportunity: opp, inputs } = item;
  const market = marketPrice(opp, inputs);
  if (market === null) return { choice: null, reason: "No expected market price yet: enter one, or let the engine use federal comparables, so it can price competitively." };

  // The walk-away price comes from the base analysis (it depends on the sub price, not on the bid).
  const probe = analyze({ opportunity: opp, inputs: { ...inputs, plannedBidUsd: market } }, world);
  const walk = probe.prices.walkAwayPriceUsd;
  if (walk === null) return { choice: null, reason: "Enter what a subcontractor is likely to charge (or get a quote): without it there is no price that protects your margin." };

  const floor = Math.max(walk, bounds.floorUsd ?? 0);
  const ceiling = bounds.ceilingUsd ?? market * RULES.autopilot.ceilingOverMarket;
  if (floor > ceiling + 0.005) {
    return { choice: null, reason: `Your lowest viable price (${usd(floor)}) is above the most you would bid (${usd(ceiling)}), so there is no price that is both competitive and profitable.` };
  }

  // Candidate prices: an even grid plus the market anchors that the win-chance heuristic reacts to.
  const set = new Set<number>();
  const steps = RULES.autopilot.priceSteps;
  for (let i = 0; i <= steps; i++) set.add(Math.ceil(floor + ((ceiling - floor) * i) / steps));
  for (const f of [0.9, 0.92, 0.95, 0.98, 1.0]) {
    const p = Math.ceil(market * f);
    if (p >= floor && p <= ceiling + 0.005) set.add(p);
  }
  const prices = [...set].filter((p) => p >= Math.ceil(floor) && p <= Math.ceil(ceiling)).sort((a, b) => a - b);

  const rows: Array<{ price: number; a: ReturnType<typeof analyze> }> = [];
  for (const price of prices) rows.push({ price, a: analyze({ opportunity: opp, inputs: { ...inputs, plannedBidUsd: price } }, world) });

  const viable = rows.filter((r) => (r.a.verdict === "qualified" || r.a.verdict === "bid-ready") && r.a.expectedProfitUsd !== null && r.a.pricing !== null);
  if (viable.length === 0) {
    const sample = rows[rows.length - 1]?.a ?? probe;
    return { choice: null, reason: `No price in your range passes every rule. ${sample.verdictReason}` };
  }
  // Highest expected profit; on a tie prefer the lower (more competitive) price.
  const best = viable.reduce((a, b) => ((b.a.expectedProfitUsd as number) > (a.a.expectedProfitUsd as number) + 1e-9 ? b : a));
  const pricing = best.a.pricing!;

  const step = Math.max(1, Math.floor(viable.length / 6));
  const considered = viable
    .filter((_, i) => i % step === 0 || viable[i] === best)
    .slice(0, 8)
    .map((r) => ({ priceUsd: r.price, winProbability: r.a.winProbability.value, profitUsd: r.a.pricing!.profitBeforeTaxUsd, expectedProfitUsd: r.a.expectedProfitUsd as number }));

  return {
    choice: {
      priceUsd: best.price,
      winProbability: best.a.winProbability.value,
      profitUsd: pricing.profitBeforeTaxUsd,
      marginRate: pricing.netMarginRate,
      expectedProfitUsd: best.a.expectedProfitUsd as number,
      marketUsd: round2(market),
      floorUsd: round2(floor),
      ceilingUsd: round2(ceiling),
      considered,
      note: `Weighed ${viable.length} prices from ${usd(floor)} to ${usd(ceiling)}. ${usd(best.price)} gives the best expected profit: about ${Math.round(best.a.winProbability.value * 100)}% to win, ${usd(pricing.profitBeforeTaxUsd)} profit if it does. The win chance is a heuristic; calibrate it from your own results.`,
    },
  };
}
