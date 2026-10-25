/**
 * Win probability: a transparent multiplicative heuristic, NOT a statistical forecast.
 * Each factor is returned so the UI can show exactly why the number is what it is.
 * Replace the multipliers in RULES.winProbability with values calibrated on your own bid history.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import type { Opportunity, Settings, WinFactor, WinProbability } from "./types";
import { clamp } from "./util";

export function estimateWinProbability(
  opp: Opportunity,
  settings: Settings,
  opts: { bidUsd: number | null; marketUsd: number | null; hasFirmQuote: boolean; daysToDeadline: number | null },
): WinProbability {
  const w = RULES.winProbability;
  const t = opp.terms;
  const p = settings.profile;
  const factors: WinFactor[] = [];
  const add = (label: string, multiplier: number, reason: string) => factors.push({ label, multiplier, reason });

  if (t.pastPerformance === "scored") {
    if (p.pastPerformanceCount === 0) add("Past performance is scored", w.pastPerformanceScoredNone, "You have no references to cite, so you will score poorly against incumbents.");
    else add("Past performance is scored", w.pastPerformanceScoredSome, "You have some references, but established competitors will have more.");
  }

  if (opts.bidUsd !== null && opts.marketUsd !== null && opts.marketUsd > 0) {
    const ratio = opts.bidUsd / opts.marketUsd;
    if (ratio <= 0.95) add("Price position", w.priceUnderMarket, `Bid is ${Math.round((1 - ratio) * 100)}% under the expected market price.`);
    else if (ratio <= 1.02) add("Price position", w.priceAtMarket, "Bid is about at the expected market price.");
    else if (ratio <= 1.1) add("Price position", w.priceSlightlyOver, `Bid is ${Math.round((ratio - 1) * 100)}% over the expected market price.`);
    else add("Price position", w.priceFarOver, `Bid is ${Math.round((ratio - 1) * 100)}% over the expected market price.`);
  } else {
    add("Price position unknown", w.priceUnknown, "No market price to compare against, so competitiveness is uncertain.");
  }

  if (!opts.hasFirmQuote) add("No firm subcontractor quote", w.noFirmQuote, "The price is not validated by a real quote.");
  if (t.setAside !== "none" && t.setAside !== "unknown") add("Restricted competition", w.restrictedPool, "A set-aside narrows the field to eligible firms.");
  if (t.rapidTurnaround === "yes") add("Rapid turnaround requested", w.rapidTurnaround, "Quick-quote / rapid-delivery language favors firms with stock or crews on hand.");
  if (opts.daysToDeadline !== null && opts.daysToDeadline >= 0 && opts.daysToDeadline < w.shortFuseDays) {
    add("Short fuse", w.shortFuse, `Only ${opts.daysToDeadline} days to prepare.`);
  }

  const raw = factors.reduce<number>((v, f) => v * f.multiplier, w.base);
  return {
    value: clamp(raw, w.floor, w.ceiling),
    base: w.base,
    factors,
    note: "Heuristic estimate for ranking only. Not a forecast; calibrate it against your own results.",
  };
}
