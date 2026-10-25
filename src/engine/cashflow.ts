/**
 * Cash timeline. This is what answers "how much money do I need BEFORE I get paid?".
 *
 * Day 0 is the award. Costs paid at award come first; the sub is paid on its own terms; the customer pays on the
 * solicitation's terms. The peak of the cumulative negative balance is the cash you must be able to put up.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import type { CashEvent, CashResult, PaymentKind, SubTerms } from "./types";
import { round2 } from "./util";

export interface CustomerTerms {
  kind: Exclude<PaymentKind, "unknown">;
  netDays: number;
  invoiceCycleDays: number;
  retainageRate: number;
  acceptanceDays: number;
}

export interface CashPlan {
  customerPriceUsd: number;
  subPriceUsd: number;
  /** Everything paid in cash at award: bond/insurance premiums, registrations, admin, bid costs. */
  upfrontCostsUsd: number;
  startLeadDays: number;
  durationDays: number;
  customer: CustomerTerms;
  sub: SubTerms;
}

interface Invoice {
  invoiceDay: number;
  share: number; // fraction of price
}

interface CustomerPayment {
  day: number;
  amountUsd: number;
  label: string;
}

/** The invoice cadence implied by the payment kind. Shares always sum to 1. */
function invoices(plan: CashPlan): Invoice[] {
  const { startLeadDays: start, durationDays: dur, customer: c } = plan;
  const end = start + dur;
  if (c.kind === "progress") {
    const cycle = Math.max(1, c.invoiceCycleDays);
    const n = Math.max(1, Math.ceil(dur / cycle));
    return Array.from({ length: n }, (_, i) => ({ invoiceDay: Math.min(start + (i + 1) * cycle, end), share: 1 / n }));
  }
  if (c.kind === "milestone") {
    const n = RULES.milestoneCount;
    return Array.from({ length: n }, (_, i) => ({ invoiceDay: Math.round(start + (dur * (i + 1)) / n), share: 1 / n }));
  }
  return [{ invoiceDay: end, share: 1 }];
}

/** When the customer's money actually arrives. */
export function customerPayments(plan: CashPlan): CustomerPayment[] {
  const { startLeadDays: start, durationDays: dur, customer: c, customerPriceUsd: price } = plan;
  const end = start + dur;
  const staged = c.kind === "progress" || c.kind === "milestone";
  const retain = staged ? c.retainageRate : 0;
  const out: CustomerPayment[] = [];

  invoices(plan).forEach((inv, i, all) => {
    const gross = price * inv.share;
    const net = gross * (1 - retain);
    const lag = c.kind === "after-acceptance" ? c.acceptanceDays + c.netDays : c.netDays;
    out.push({
      day: inv.invoiceDay + lag,
      amountUsd: net,
      label: all.length > 1 ? `Customer payment ${i + 1} of ${all.length}` : "Customer payment",
    });
  });

  if (retain > 0) {
    out.push({
      day: end + c.acceptanceDays + RULES.retainageReleaseDays,
      amountUsd: price * retain,
      label: "Retainage released",
    });
  }

  // Cent-exact: push rounding residue into the last payment so the total equals the price.
  const rounded = out.map((p) => ({ ...p, amountUsd: round2(p.amountUsd) }));
  const residue = round2(price - rounded.reduce((s, p) => s + p.amountUsd, 0));
  const last = rounded[rounded.length - 1];
  if (last) last.amountUsd = round2(last.amountUsd + residue);
  return rounded;
}

interface RawEvent {
  day: number;
  label: string;
  amountUsd: number;
  order: number; // same-day tiebreak: -1 normal outflow, 0 inflow, 1 pay-when-paid outflow (after the money lands)
}

export function simulateCash(plan: CashPlan): CashResult {
  const { startLeadDays: start, durationDays: dur, subPriceUsd: S, customerPriceUsd: B, sub } = plan;
  const end = start + dur;
  const events: RawEvent[] = [];

  if (plan.upfrontCostsUsd > 0) {
    events.push({ day: 0, label: "Costs paid at award", amountUsd: -plan.upfrontCostsUsd, order: -1 });
  }

  const inflows = customerPayments(plan);
  for (const p of inflows) events.push({ day: p.day, label: p.label, amountUsd: p.amountUsd, order: 0 });

  switch (sub.kind) {
    case "pay-when-paid":
      if (B > 0) {
        for (const p of inflows) {
          events.push({ day: p.day, label: "Subcontractor paid from that receipt", amountUsd: -S * (p.amountUsd / B), order: 1 });
        }
      }
      break;
    case "deposit-balance": {
      const deposit = S * sub.depositRate;
      if (deposit > 0) events.push({ day: start, label: "Subcontractor deposit", amountUsd: -deposit, order: -1 });
      if (S - deposit > 0) {
        events.push({ day: end + sub.netDays, label: "Subcontractor balance", amountUsd: -(S - deposit), order: -1 });
      }
      break;
    }
    case "net":
      invoices(plan).forEach((inv, i, all) => {
        events.push({
          day: inv.invoiceDay + sub.netDays,
          label: all.length > 1 ? `Subcontractor invoice ${i + 1} of ${all.length}` : "Subcontractor invoice",
          amountUsd: -S * inv.share,
          order: -1,
        });
      });
      break;
    case "on-completion":
      events.push({ day: end + sub.netDays, label: "Subcontractor paid on completion", amountUsd: -S, order: -1 });
      break;
  }

  events.sort((a, b) => a.day - b.day || a.order - b.order);

  let balance = 0;
  let lowest = 0;
  let lowestDay = 0;
  const timeline: CashEvent[] = events.map((e) => {
    balance += e.amountUsd;
    if (balance < lowest) {
      lowest = balance;
      lowestDay = e.day;
    }
    return { day: e.day, label: e.label, amountUsd: round2(e.amountUsd), balanceUsd: round2(balance) };
  });

  const inflowDays = inflows.map((p) => p.day);
  return {
    peakCashRequiredUsd: round2(Math.max(0, -lowest)),
    daysToFirstPayment: inflowDays.length ? Math.min(...inflowDays) : 0,
    daysToFullPayment: inflowDays.length ? Math.max(...inflowDays) : 0,
    lowestBalanceDay: lowestDay,
    events: timeline,
  };
}
