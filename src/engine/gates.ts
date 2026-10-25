/**
 * The six gates. Each returns pass / fail / unknown.
 *
 *   HARD (owner-declared, non-negotiable):  subcontracting, prime-eligibility, financing
 *   QUALIFYING:                              margin, payment-timing, deadline
 *
 * Rule of thumb used everywhere: a gate is `pass` only when the facts PROVE it, `fail` only when the facts PROVE
 * it cannot work, and `unknown` otherwise. `unknown` can never produce a bid recommendation.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import type { Evaluated } from "./scenarios";
import type { Gate, GateStatus, Opportunity, Settings } from "./types";
import { daysBetween, isIsoDate, pct, usd } from "./util";

const SMALL_BUSINESS_SET_ASIDES = new Set(["small-business", "8a", "sdvosb", "wosb", "hubzone"]);

function gate(partial: Partial<Gate> & Pick<Gate, "id" | "label" | "hard" | "status" | "summary">): Gate {
  return { details: [], evidence: [], questions: [], fixableBy: null, ...partial };
}

/** Combine sub-check statuses: any fail -> fail; else any unknown -> unknown; else pass. */
const combine = (statuses: GateStatus[]): GateStatus =>
  statuses.includes("fail") ? "fail" : statuses.includes("unknown") ? "unknown" : "pass";

export interface GateContext {
  opp: Opportunity;
  settings: Settings;
  today: string;
  /** Planned share of the bid paid to subs, when it can be computed (base scenario). */
  plannedSubShare: number | null;
  scenarios: Evaluated;
}

/* -------------------------------- subcontracting -------------------------------- */

export function subcontractingGate({ opp, plannedSubShare }: GateContext): Gate {
  const t = opp.terms;
  const evidence = t.evidence.subcontracting ?? [];
  const base = { id: "subcontracting" as const, label: "Work may be subcontracted", hard: true, evidence };

  if (t.subcontracting === "prohibited") {
    return gate({
      ...base,
      status: "fail",
      summary: "The solicitation prohibits subcontracting / intermediaries.",
      details: ["The model depends on subcontractors performing the work. A prime that cannot use them cannot do this deal."],
    });
  }

  const questions: string[] = [];
  const details: string[] = [];
  let status: GateStatus;

  if (t.subcontracting === "unknown") {
    status = "unknown";
    questions.push("May a prime contractor use qualified subcontractors for some or all of the scope, and is any subcontractor disclosure or approval required?");
  } else if (t.subcontracting === "allowed") {
    status = "pass";
  } else {
    // limited: a stated cap, a set-aside rule, or an approval requirement
    const cap = t.subcontractShareCap;
    if (cap !== null) {
      if (plannedSubShare === null) {
        status = "unknown";
        details.push(`Subs may receive at most ${pct(cap)} of the price. The planned sub share is not known yet.`);
      } else if (plannedSubShare <= cap + 1e-9) {
        status = "pass";
        details.push(`Planned sub share ${pct(plannedSubShare, 1)} is within the ${pct(cap)} cap.`);
      } else {
        status = "unknown";
        details.push(
          `Planned sub share ${pct(plannedSubShare, 1)} exceeds the ${pct(cap)} cap. This only works if the subs qualify as "similarly situated" or the price split changes.`,
        );
        questions.push("Do the planned subcontractors count as similarly situated entities under the solicitation's limitation-on-subcontracting clause?");
      }
    } else {
      status = "unknown";
      details.push("Subcontracting is restricted but no numeric cap or approval process was found in the text.");
      questions.push("What exactly limits subcontracting here (a percentage cap, prior written approval, or a named-sub requirement)?");
    }
  }

  // Small-business set-asides carry a default federal cap even when the clause text was not pasted.
  if (SMALL_BUSINESS_SET_ASIDES.has(opp.terms.setAside) && t.subcontractShareCap === null) {
    const defaultCap = RULES.setAsideSubcontractCap[opp.category];
    details.push(
      `Set-aside awards are generally subject to SBA limits on subcontracting (13 CFR 125.6): about ${pct(defaultCap)} of the price may go to subs that are not similarly situated. Confirm the clause in the solicitation.`,
    );
    if (plannedSubShare !== null && plannedSubShare > defaultCap + 1e-9) {
      if (status === "pass") status = "unknown";
      questions.push("Planned sub share exceeds the typical set-aside limit. Will every sub be a similarly situated small business?");
    } else if (plannedSubShare === null && status === "pass") {
      status = "unknown";
      questions.push("Confirm the sub share stays within the set-aside subcontracting limit once the price split is known.");
    }
  }

  return gate({
    ...base,
    status,
    summary:
      status === "pass"
        ? t.subcontracting === "allowed"
          ? "Subcontracting is permitted."
          : "Subcontracting is limited, and the plan stays within the limit."
        : "Subcontracting rules are not established yet.",
    details,
    questions,
  });
}

/* ------------------------------ prime eligibility ------------------------------- */

export function primeEligibilityGate({ opp, settings, today }: GateContext): Gate {
  const t = opp.terms;
  const p = settings.profile;
  const checks: Array<{ status: GateStatus; line: string; question?: string; fix?: string }> = [];

  // Registration for federal awards
  if (opp.source === "sam.gov") {
    checks.push(
      p.samRegistered
        ? { status: "pass", line: "Active SAM.gov registration on file." }
        : { status: "fail", line: "Federal awards require an active SAM.gov registration, and you have none.", fix: "Register at SAM.gov (free; allow several weeks to activate)." },
    );
  }

  // Set-aside eligibility
  switch (t.setAside) {
    case "unknown":
      checks.push({ status: "unknown", line: "Set-aside status not established.", question: "Is this solicitation a set-aside, and for which program?" });
      break;
    case "none":
      checks.push({ status: "pass", line: "Open competition (no set-aside)." });
      break;
    case "small-business":
      checks.push(
        p.smallBusiness
          ? { status: "pass", line: "Small-business set-aside; you are a small business." }
          : { status: "fail", line: "Small-business set-aside and your profile is not a small business." },
      );
      break;
    default:
      checks.push(
        p.certifications.includes(t.setAside)
          ? { status: "pass", line: `Set-aside requires ${t.setAside.toUpperCase()}; you hold it.` }
          : { status: "fail", line: `Set-aside requires ${t.setAside.toUpperCase()} certification, which you do not hold.` },
      );
  }

  // Insurance
  if (t.insuranceRequired === "yes") {
    if (t.insuranceMinLimitUsd !== null) {
      checks.push(
        p.insuranceCoverageUsd >= t.insuranceMinLimitUsd
          ? { status: "pass", line: `Insurance requirement (${usd(t.insuranceMinLimitUsd)}) is covered by your ${usd(p.insuranceCoverageUsd)} limit.` }
          : {
              status: "fail",
              line: `Requires ${usd(t.insuranceMinLimitUsd)} in insurance; you carry ${usd(p.insuranceCoverageUsd)}.`,
              fix: "Bind a policy with the required limits (premium is real cash; include it in upfront costs).",
            },
      );
    } else if (p.insuranceCoverageUsd === 0) {
      checks.push({
        status: "fail",
        line: "Insurance is required and you carry none.",
        fix: "Bind general-liability coverage (and any other required lines) before bidding.",
      });
    } else {
      checks.push({
        status: "unknown",
        line: "Insurance is required but the minimum limits were not found.",
        question: "What insurance lines and minimum limits are required?",
      });
    }
  } else if (t.insuranceRequired === "unknown") {
    checks.push({ status: "unknown", line: "Insurance requirements not established.", question: "What insurance is required (lines and limits)?" });
  } else {
    checks.push({ status: "pass", line: "No insurance requirement stated." });
  }

  // Bonds
  const bondChecks: Array<[string, "yes" | "no" | "unknown"]> = [
    ["Bid bond", t.bidBond],
    ["Performance bond", t.performanceBond],
    ["Payment bond", t.paymentBond],
  ];
  for (const [label, v] of bondChecks) {
    if (v === "yes") {
      checks.push(
        p.bondingCapacityUsd > 0
          ? { status: "pass", line: `${label} required; you have bonding capacity (${usd(p.bondingCapacityUsd)}).` }
          : { status: "fail", line: `${label} required and you have no bonding capacity.`, fix: "Obtain a surety relationship (usually needs financials and operating history)." },
      );
    } else if (v === "unknown") {
      checks.push({ status: "unknown", line: `${label} requirement not established.`, question: `Is a ${label.toLowerCase()} required?` });
    }
  }

  // Licensing
  const risk = RULES.licenseRisk[opp.category as keyof typeof RULES.licenseRisk];
  if (t.licensingRequired === "yes") {
    checks.push(
      p.licenses.length > 0
        ? { status: "pass", line: `Licensing required; your profile lists: ${p.licenses.join(", ")}. Confirm they cover this scope.` }
        : {
            status: "unknown",
            line: "A license is required and your profile lists none.",
            question: "Which license is required, and must the PRIME hold it (or may a licensed sub hold it)?",
            fix: "Add the license to your profile if you hold it, or confirm a licensed sub may satisfy it.",
          },
    );
  } else if (t.licensingRequired === "unknown") {
    checks.push({
      status: "unknown",
      line: risk ?? "Licensing requirements not established.",
      question: "Does this work require a license, and must the prime hold it?",
    });
  }

  // Experience / past performance
  if (t.minYearsExperience !== null) {
    checks.push(
      p.yearsInBusiness >= t.minYearsExperience
        ? { status: "pass", line: `Requires ${t.minYearsExperience} years of experience; you have ${p.yearsInBusiness}.` }
        : { status: "fail", line: `Requires ${t.minYearsExperience} years of experience; you have ${p.yearsInBusiness}.` },
    );
  }
  if (t.pastPerformance === "required") {
    checks.push(
      p.pastPerformanceCount > 0
        ? { status: "pass", line: `Past performance required; you can cite ${p.pastPerformanceCount} reference(s).` }
        : { status: "fail", line: "Past performance is required and you have none to cite." },
    );
  }

  // Mandatory pre-bid meeting
  if (t.mandatoryPreBid === "yes") {
    if (t.preBidDate && isIsoDate(t.preBidDate) && daysBetween(today, t.preBidDate) < 0) {
      checks.push({ status: "fail", line: `A mandatory pre-bid meeting was held on ${t.preBidDate}. It has passed.` });
    } else if (t.preBidDate) {
      checks.push({ status: "unknown", line: `Mandatory pre-bid meeting on ${t.preBidDate}: you must attend.`, question: "Confirm attendance is possible for the mandatory pre-bid meeting." });
    } else {
      checks.push({ status: "unknown", line: "A mandatory pre-bid meeting is required; the date was not found.", question: "When is the mandatory pre-bid meeting, and has it already happened?" });
    }
  }

  const status = combine(checks.map((c) => c.status));
  const failed = checks.filter((c) => c.status === "fail");
  return gate({
    id: "prime-eligibility",
    label: "You can qualify as the prime",
    hard: true,
    status,
    summary:
      status === "pass"
        ? "Every requirement found is met by your company profile."
        : status === "fail"
          ? `Cannot qualify as prime today: ${failed.map((f) => f.line).join(" ")}`
          : "Eligibility cannot be confirmed from what is known.",
    details: checks.map((c) => `${c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "?"} ${c.line}`),
    evidence: [
      ...(t.evidence.insuranceRequired ?? []),
      ...(t.evidence.pastPerformance ?? []),
      ...(t.evidence.minYearsExperience ?? []),
      ...(t.evidence.mandatoryPreBid ?? []),
      ...(t.evidence.setAside ?? []),
      ...(t.evidence.licensingRequired ?? []),
      ...(t.evidence.bidBond ?? []),
      ...(t.evidence.performanceBond ?? []),
      ...(t.evidence.paymentBond ?? []),
    ],
    questions: checks.flatMap((c) => (c.question ? [c.question] : [])),
    fixableBy: failed.length > 0 && failed.every((f) => f.fix) ? failed.map((f) => f.fix as string).join(" ") : null,
  });
}

/* ----------------------------------- financing ---------------------------------- */

export function financingGate({ settings, scenarios }: GateContext): Gate {
  const cap = settings.availableCapitalUsd;
  const base = { id: "financing" as const, label: "Financeable without cash you don't have", hard: true };
  const opt = scenarios.optimistic.cash;
  const cons = scenarios.conservative.cash;

  if (!opt || !cons) {
    return gate({
      ...base,
      status: "unknown",
      summary: "Cannot size the cash needed: contract value or subcontractor price is missing.",
      questions: ["What is the expected contract value, and what will the subcontractor charge?"],
    });
  }
  const need = (c: typeof opt) => c.peakCashRequiredUsd;
  if (need(cons) <= cap) {
    return gate({
      ...base,
      status: "pass",
      summary: `Peak cash needed is at most ${usd(need(cons))}, within your ${usd(cap)}, even under cautious assumptions.`,
    });
  }
  if (need(opt) > cap) {
    return gate({
      ...base,
      status: "fail",
      summary: `Needs at least ${usd(need(opt))} of cash before you are paid; you have ${usd(cap)}.`,
      details: [`Even with the sub paid only after you are paid, the up-front costs exceed your capital.`],
      fixableBy: null,
    });
  }
  return gate({
    ...base,
    status: "unknown",
    summary: `Cash needed ranges ${usd(need(opt))} to ${usd(need(cons))} against ${usd(cap)} available. It depends on the sub's payment terms.`,
    details: ["Works only if the subcontract is pay-when-paid (or equivalent) with no deposit."],
    questions: ["Will the subcontractor accept pay-when-paid terms with no deposit?"],
  });
}

/* ------------------------------------- margin ----------------------------------- */

export function marginGate({ settings, scenarios }: GateContext): Gate {
  const base = { id: "margin" as const, label: "Leaves enough margin", hard: false };
  const opt = scenarios.optimistic.pricing;
  const cons = scenarios.conservative.pricing;
  if (!opt || !cons) {
    return gate({
      ...base,
      status: "unknown",
      summary: "Cannot judge margin: a price and a subcontractor cost are both needed.",
      questions: ["What price will the customer pay (or what is the government estimate), and what will the sub charge?"],
    });
  }
  const okCons = cons.netMarginRate >= settings.walkAwayMargin && cons.profitBeforeTaxUsd >= settings.minProfitUsd;
  const okOpt = opt.netMarginRate >= settings.walkAwayMargin && opt.profitBeforeTaxUsd >= settings.minProfitUsd;
  const line = (p: typeof cons) => `${pct(p.netMarginRate, 1)} margin, ${usd(p.profitBeforeTaxUsd)} profit before tax`;
  if (okCons) {
    return gate({ ...base, status: "pass", summary: `Clears your floor even in the cautious case: ${line(cons)}.` });
  }
  if (!okOpt) {
    return gate({
      ...base,
      status: "fail",
      summary: `Falls short of your floor (${pct(settings.walkAwayMargin)} and ${usd(settings.minProfitUsd)}) even in the best case: ${line(opt)}.`,
    });
  }
  return gate({
    ...base,
    status: "unknown",
    summary: `Margin ranges from ${line(cons)} (cautious) to ${line(opt)} (best case). A firm quote settles it.`,
    questions: ["Get a firm subcontractor quote for this exact scope."],
  });
}

/* --------------------------------- payment timing -------------------------------- */

export function paymentTimingGate({ opp, settings, scenarios }: GateContext): Gate {
  const base = { id: "payment-timing" as const, label: "Gets paid soon enough", hard: false };
  const t = opp.terms;
  const evidence = [...(t.evidence.paymentKind ?? []), ...(t.evidence.paymentNetDays ?? []), ...(t.evidence.retainageRate ?? [])];
  if (t.paymentKind === "unknown" || t.paymentNetDays === null) {
    return gate({
      ...base,
      status: "unknown",
      evidence,
      summary: "The actual payment clause has not been found (invoice terms, milestones, retainage, acceptance).",
      details: ["A long open posting does not mean fast payment. The clause must be extracted, not assumed."],
      questions: ["Where are the terms governing invoicing, acceptance, milestone payments, retainage, and payment deadlines?"],
    });
  }
  const cash = scenarios.conservative.cash ?? scenarios.base.cash;
  if (!cash) {
    return gate({ ...base, status: "unknown", evidence, summary: "Payment terms are known but the contract value is not, so timing cannot be computed." });
  }
  const first = cash.daysToFirstPayment;
  const full = cash.daysToFullPayment;
  const ok = first <= settings.maxDaysToFirstPayment && full <= settings.maxDaysToFullPayment;
  return gate({
    ...base,
    status: ok ? "pass" : "fail",
    evidence,
    summary: `First payment about ${first} days after award; fully paid by about day ${full}. Your limits are ${settings.maxDaysToFirstPayment} and ${settings.maxDaysToFullPayment}.`,
    details: t.retainageRate ? [`${pct(t.retainageRate)} retainage is held until after completion.`] : [],
  });
}

/* ------------------------------------ deadline ----------------------------------- */

export function deadlineGate({ opp, settings, today }: GateContext): Gate {
  const base = { id: "deadline" as const, label: "Enough time to bid properly", hard: false };
  if (!isIsoDate(opp.dueDate)) {
    return gate({ ...base, status: "unknown", summary: "No due date recorded.", questions: ["What is the proposal due date and time?"] });
  }
  const days = daysBetween(today, opp.dueDate);
  if (days < 0) return gate({ ...base, status: "fail", summary: `The due date (${opp.dueDate.slice(0, 10)}) has passed.` });
  if (days < settings.minDaysToDeadline) {
    return gate({
      ...base,
      status: "fail",
      summary: `Only ${days} day(s) left; you need at least ${settings.minDaysToDeadline} to get firm sub quotes and write a compliant bid.`,
    });
  }
  const warn = opp.terms.rapidTurnaround === "yes" ? ["The listing calls for quick quotes / rapid delivery, which is hard to promise through a sub."] : [];
  return gate({ ...base, status: "pass", summary: `${days} days until the due date.`, details: warn });
}
