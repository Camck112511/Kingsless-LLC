import { describe, expect, it } from "vitest";
import { customerPayments, simulateCash, type CashPlan } from "../cashflow";

const plan = (over: Partial<CashPlan> = {}): CashPlan => ({
  customerPriceUsd: 10_000,
  subPriceUsd: 6_000,
  upfrontCostsUsd: 0,
  startLeadDays: 14,
  durationDays: 30,
  customer: { kind: "net-after-invoice", netDays: 30, invoiceCycleDays: 30, retainageRate: 0, acceptanceDays: 0 },
  sub: { kind: "pay-when-paid", depositRate: 0, netDays: 0 },
  ...over,
});

describe("cash timeline", () => {
  it("pay-when-paid needs no working capital beyond upfront costs", () => {
    const r = simulateCash(plan());
    expect(r.peakCashRequiredUsd).toBe(0);
    expect(r.daysToFirstPayment).toBe(74); // 14 lead + 30 work + 30 net
  });

  it("a 30% deposit with the balance due at completion forces you to front the whole sub price", () => {
    const r = simulateCash(plan({ sub: { kind: "deposit-balance", depositRate: 0.3, netDays: 0 } }));
    expect(r.peakCashRequiredUsd).toBe(6_000);
    expect(r.lowestBalanceDay).toBe(44);
  });

  it("net-30 sub terms on a net-30 customer still leave a gap", () => {
    const r = simulateCash(plan({ sub: { kind: "net", depositRate: 0, netDays: 30 } }));
    // sub due day 44+30 = 74, customer pays day 74; outflows sort before inflows, so the gap is the full sub price.
    expect(r.peakCashRequiredUsd).toBe(6_000);
  });

  it("upfront costs always count, even with pay-when-paid", () => {
    expect(simulateCash(plan({ upfrontCostsUsd: 450 })).peakCashRequiredUsd).toBe(450);
  });

  it("peak cash never decreases as the sub price rises", () => {
    let last = -1;
    for (let s = 0; s <= 10_000; s += 500) {
      const peak = simulateCash(plan({ subPriceUsd: s, sub: { kind: "deposit-balance", depositRate: 0.2, netDays: 10 } })).peakCashRequiredUsd;
      expect(peak).toBeGreaterThanOrEqual(last);
      last = peak;
    }
  });
});

describe("customer payment schedule", () => {
  it("always sums to the contract price, retainage included", () => {
    const p = plan({
      customerPriceUsd: 9_000,
      durationDays: 90,
      customer: { kind: "progress", netDays: 30, invoiceCycleDays: 30, retainageRate: 0.1, acceptanceDays: 0 },
    });
    const pays = customerPayments(p);
    expect(pays.reduce((s, x) => s + x.amountUsd, 0)).toBeCloseTo(9_000, 2);
    expect(pays.map((x) => x.day)).toEqual([74, 104, 134, 134]);
    expect(pays.at(-1)?.label).toBe("Retainage released");
  });

  it("after-acceptance adds the review period before the net days", () => {
    const pays = customerPayments(plan({ customer: { kind: "after-acceptance", netDays: 30, invoiceCycleDays: 30, retainageRate: 0, acceptanceDays: 14 } }));
    expect(pays).toHaveLength(1);
    expect(pays[0]?.day).toBe(14 + 30 + 14 + 30);
  });

  it("milestones split the price evenly", () => {
    const pays = customerPayments(plan({ durationDays: 60, customer: { kind: "milestone", netDays: 15, invoiceCycleDays: 30, retainageRate: 0, acceptanceDays: 0 } }));
    expect(pays).toHaveLength(3);
    expect(pays.reduce((s, x) => s + x.amountUsd, 0)).toBeCloseTo(10_000, 2);
  });
});
