import { describe, expect, it } from "vitest";
import { calcPricing, marginFromMarkup, markupFromMargin, maxSubPriceForProfit, minPriceFor, priceForMargin } from "../pricing";

describe("pricing calculator (the owner's illustrative $10,000 example)", () => {
  const r = calcPricing(10_000, 5_700, 500);

  it("reproduces the illustrated figures: 38.0% net margin and 57.0% subcontractor share", () => {
    expect(r.grossSpreadUsd).toBe(4_300);
    expect(r.profitBeforeTaxUsd).toBe(3_800);
    expect(r.netMarginRate).toBeCloseTo(0.38, 10);
    expect(r.subShareRate).toBeCloseTo(0.57, 10);
  });

  it("keeps gross margin, net margin and markup distinct", () => {
    expect(r.grossMarginRate).toBeCloseTo(0.43, 10);
    expect(r.markupOnCostRate).toBeCloseTo(3_800 / 6_200, 10);
  });

  it("rejects negative or non-finite inputs", () => {
    expect(() => calcPricing(-1, 0, 0)).toThrow(RangeError);
    expect(() => calcPricing(100, Number.NaN, 0)).toThrow(RangeError);
  });

  it("returns zero rates for a zero contract value instead of NaN", () => {
    const z = calcPricing(0, 0, 0);
    expect(z.netMarginRate).toBe(0);
  });
});

describe("margin vs markup", () => {
  it("a 10% margin on $10,000 is $1,000 of gross profit, which is an 11.1% markup on cost", () => {
    const price = 10_000;
    const cost = price * (1 - 0.1);
    expect(price - cost).toBeCloseTo(1_000, 6);
    expect(markupFromMargin(0.1)).toBeCloseTo(1 / 9, 10);
    expect(priceForMargin(cost, 0.1)).toBeCloseTo(price, 6);
  });

  it("round-trips", () => {
    for (const m of [0.05, 0.1, 0.2, 0.38]) expect(marginFromMarkup(markupFromMargin(m))).toBeCloseTo(m, 12);
  });

  it("refuses a 100% margin", () => {
    expect(() => priceForMargin(100, 1)).toThrow(RangeError);
    expect(() => markupFromMargin(1)).toThrow(RangeError);
  });
});

describe("price floors", () => {
  it("uses the dollar floor when the margin floor is smaller", () => {
    // cost 1,000, 10% margin -> 1,111; dollar floor +250 -> 1,250
    expect(minPriceFor(1_000, 0.1, 250)).toBe(1_250);
  });

  it("uses the margin floor when it is larger", () => {
    expect(minPriceFor(10_000, 0.2, 250)).toBeCloseTo(12_500, 6);
  });

  it("max sub price solves profit = bid - fixed - sub*(1+c)", () => {
    const s = maxSubPriceForProfit(10_000, 500, 0.05, 1_000);
    expect(10_000 - 500 - s * 1.05).toBeCloseTo(1_000, 6);
  });

  it("never returns a negative sub price", () => {
    expect(maxSubPriceForProfit(100, 500, 0.05, 1_000)).toBe(0);
  });
});
