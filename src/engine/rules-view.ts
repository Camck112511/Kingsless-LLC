/**
 * Plain-language description of the rules, generated from the same constants the engine runs on, so the
 * /admin/rules page can never drift from what the engine actually does. PROTECTED engine file.
 */
import { DEFAULT_SETTINGS, ENGINE_VERSION, RULES } from "./config";
import { pct, usd } from "./util";

export interface RulesView {
  version: string;
  gates: Array<{ id: string; label: string; hard: boolean; rule: string }>;
  verdicts: Array<{ id: string; label: string; meaning: string }>;
  defaults: Array<{ label: string; value: string; note: string }>;
  assumptions: Array<{ label: string; value: string }>;
  ranking: string;
  winProbability: string;
  honesty: string[];
}

export function describeRules(): RulesView {
  const s = DEFAULT_SETTINGS;
  const w = RULES.winProbability;
  return {
    version: ENGINE_VERSION,
    gates: [
      { id: "subcontracting", label: "Work may be subcontracted", hard: true, rule: "Pass only if the solicitation permits subcontracting (and any cap is respected). Fail if it prohibits subcontracting or intermediaries. Unknown if it is silent." },
      { id: "prime-eligibility", label: "You can qualify as the prime", hard: true, rule: "Every requirement found (SAM registration, set-aside, insurance, bonds, licensing, experience, past performance, mandatory pre-bid meeting) is checked against your company profile. Any miss fails; anything unconfirmed is unknown." },
      { id: "financing", label: "Financeable without cash you don't have", hard: true, rule: `Simulates the cash timeline. Pass if peak cash needed stays within your available capital even under cautious sub terms; fail if it exceeds capital even if the sub is paid only after you are; otherwise unknown.` },
      { id: "margin", label: "Leaves enough margin", hard: false, rule: `Pass if the cautious case still clears the walk-away margin (${pct(s.walkAwayMargin)}) and the dollar floor (${usd(s.minProfitUsd)}); fail if even the best case misses; otherwise unknown.` },
      { id: "payment-timing", label: "Gets paid soon enough", hard: false, rule: `Needs the actual payment clause. First payment within ${s.maxDaysToFirstPayment} days of award and full payment within ${s.maxDaysToFullPayment} days, counting invoice cycle, net days, acceptance, and retainage.` },
      { id: "deadline", label: "Enough time to bid properly", hard: false, rule: `Fail if the due date has passed or fewer than ${s.minDaysToDeadline} days remain (time for real quotes and a compliant bid).` },
    ],
    verdicts: [
      { id: "reject", label: "Reject", meaning: "At least one gate is proven to fail under current rules." },
      { id: "investigate", label: "Investigate", meaning: "Nothing has failed, but something cannot be proven. Never a recommendation." },
      { id: "qualified", label: "Qualified", meaning: "Every gate passes even under cautious assumptions. Get firm quotes next." },
      { id: "bid-ready", label: "Bid-ready", meaning: "Every gate passes on a firm quote from a subcontractor who confirmed they will work under your agreement." },
    ],
    defaults: [
      { label: "Available capital", value: usd(s.availableCapitalUsd), note: "Hard ceiling for the financing gate." },
      { label: "Walk-away margin", value: pct(s.walkAwayMargin), note: "Lowest net margin (before tax) a bid may carry." },
      { label: "Target margin", value: pct(s.targetMargin), note: "Margin the target bid aims for." },
      { label: "Minimum profit", value: usd(s.minProfitUsd), note: "Dollar floor, so tiny jobs don't pass on percentage alone." },
      { label: "Overrun cushion", value: pct(s.contingencyRate), note: "Added to the sub price as a cost." },
      { label: "Max days to first payment", value: `${s.maxDaysToFirstPayment}`, note: "Counted from award." },
      { label: "Max days to full payment", value: `${s.maxDaysToFullPayment}`, note: "Counted from award, retainage included." },
      { label: "Minimum days to deadline", value: `${s.minDaysToDeadline}`, note: "Time to obtain quotes and write the bid." },
    ],
    assumptions: [
      { label: "Estimate band (sub price not yet quoted)", value: `${pct(RULES.estimateBand.lowRate)} under to ${pct(RULES.estimateBand.highRate)} over your estimate` },
      { label: "Sub terms when unknown (cautious)", value: `${pct(RULES.subTermsAssumed.conservative.depositRate)} deposit, balance on completion` },
      { label: "Sub terms when unknown (best case)", value: "Pay-when-paid, no deposit" },
      { label: "Set-aside subcontracting limit (when the clause is not pasted)", value: `${pct(RULES.setAsideSubcontractCap["other-services"])} services/supply, ${pct(RULES.setAsideSubcontractCap["construction-general"])} general construction, ${pct(RULES.setAsideSubcontractCap["construction-specialty"])} specialty trades (13 CFR 125.6; confirm in the solicitation)` },
    ],
    ranking: `Within a verdict tier: expected profit ÷ (1 + days to first payment ÷ ${RULES.ranking.paymentHorizonDays}) ÷ (1 + peak cash ÷ available capital). Profit counts for less the later it arrives and the more cash it ties up.`,
    winProbability: `Starts at ${pct(w.base)} and is multiplied by visible factors (past performance, price vs. market, firm quote, set-aside pool, rapid turnaround, time to prepare), bounded ${pct(w.floor)} to ${pct(w.ceiling)}. A heuristic for ranking, not a forecast.`,
    honesty: [
      "Unknown is never treated as pass.",
      "A listing's age or length of time open says nothing about when it pays; the payment clause must be found.",
      "A company in a directory is not proof it will accept your price; candidates are labelled verified, partially verified or unverified.",
      "Margin is profit ÷ price. Markup is profit ÷ cost. They are shown separately and never mixed.",
      "Figures are before tax and exclude overhead beyond the costs you enter.",
    ],
  };
}
