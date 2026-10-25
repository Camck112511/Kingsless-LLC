/**
 * The bid workflow: the steps from "is this worth it?" to "we won, line up the subcontractor", what each step needs, and
 * the final check before anything is sent. Pure functions of facts the engine already holds.
 *
 * Hard rule carried over from the engine: the console only SENDS a bid when every rule is proven, a subcontractor has
 * quoted and confirmed, the listing is verified, the price clears the walk-away line and no placeholder remains. Recording
 * a bid that you submitted yourself is always allowed: it is a record of what happened, not an action.
 *
 * PROTECTED engine file.
 */
import type { Analysis, BidPackage, BidRecord, Inputs, Opportunity, PreflightCheck, Settings, WorkflowStep } from "./types";
import { isIsoDate, usd } from "./util";

export interface FlowInput {
  opp: Opportunity;
  analysis: Analysis;
  inputs: Inputs;
  bid: BidRecord;
  settings: Settings;
  pkg: BidPackage;
  emailConfigured: boolean;
}

export type Channel = "email" | "portal";

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const isEmail = (s: string): boolean => EMAIL.test(s.trim());

export function preflight(f: FlowInput, channel: Channel, recipient = ""): PreflightCheck[] {
  const { opp, analysis: a, inputs, bid, pkg } = f;
  const blocking = channel === "email";
  const reviewed = bid.prep.reviewedDigest !== "" && bid.prep.reviewedDigest === pkg.digest;
  const price = inputs.plannedBidUsd;
  const walk = a.prices.walkAwayPriceUsd;
  const proven = a.verdict === "qualified" || a.verdict === "bid-ready";
  const failing = a.gates.filter((g) => g.status !== "pass");

  const checks: PreflightCheck[] = [
    {
      id: "listing",
      label: "Listing confirmed against the official solicitation",
      ok: opp.provenance.verified,
      blocking,
      detail: opp.provenance.verified ? "You confirmed the facts against the official listing." : "Open the official listing, read the documents, then tick the confirmation under “Solicitation facts”.",
    },
    {
      id: "rules",
      label: "Every rule is proven",
      ok: proven,
      blocking,
      detail: proven ? "All rules pass, even under cautious assumptions." : `Not yet: ${failing.map((g) => g.label.toLowerCase()).join("; ")}.`,
    },
    {
      id: "quote",
      label: "A subcontractor has quoted and confirmed",
      ok: a.verdict === "bid-ready",
      blocking,
      detail: a.verdict === "bid-ready" ? "A firm quote from a subcontractor who will work under your agreement backs the price." : "Get a firm written quote, and the sub's confirmation that they will work under your agreement, before bidding.",
    },
    {
      id: "deadline",
      label: "The due date has not passed",
      ok: isIsoDate(opp.dueDate) && a.daysToDeadline !== null && a.daysToDeadline >= 0,
      blocking,
      detail: !isIsoDate(opp.dueDate) ? "No due date is recorded." : a.daysToDeadline !== null && a.daysToDeadline < 0 ? "The due date has passed." : `${a.daysToDeadline} day(s) left.`,
    },
    {
      id: "price",
      label: "A bid price is set",
      ok: price !== null && price > 0,
      blocking,
      detail: price !== null && price > 0 ? `Bid price ${usd(price)}.` : "Choose your bid price in the price step.",
    },
    {
      id: "floor",
      label: "The price clears your walk-away line",
      ok: price !== null && price > 0 && (walk === null || price >= walk - 0.005),
      blocking,
      detail:
        price === null || price <= 0
          ? "Set a price first."
          : walk === null
            ? "No walk-away price yet (needs a sub price)."
            : price >= walk - 0.005
              ? `${usd(price)} is at or above your walk-away price of ${usd(walk)}.`
              : `${usd(price)} is below your walk-away price of ${usd(walk)}: at this price the bid does not meet your own margin rule.`,
    },
    {
      id: "placeholders",
      label: "No blanks left in the documents",
      ok: pkg.placeholders.length === 0,
      blocking,
      detail: pkg.placeholders.length === 0 ? "Nothing left to fill in." : `${pkg.placeholders.length} still to complete: ${pkg.placeholders.slice(0, 5).join("; ")}${pkg.placeholders.length > 5 ? "…" : ""}.`,
    },
    {
      id: "reviewed",
      label: "You reviewed every document",
      ok: reviewed,
      blocking,
      detail: reviewed ? "Confirmed." : bid.prep.reviewedDigest ? "The documents changed since you confirmed. Read them again and confirm." : "Read each document, then confirm. You sign this bid; the console only drafts it.",
    },
  ];
  if (channel === "email") {
    checks.push(
      { id: "recipient", label: "A valid recipient address", ok: isEmail(recipient), blocking: true, detail: isEmail(recipient) ? recipient.trim() : "Enter the address the solicitation says to email bids to." },
      { id: "email-ready", label: "Email sending is set up on the server", ok: f.emailConfigured, blocking: true, detail: f.emailConfigured ? "Ready." : "Add RESEND_API_KEY and BID_EMAIL_FROM to the server environment, or submit through the portal yourself and record it here." },
    );
  }
  return checks;
}

export const canSend = (checks: PreflightCheck[]): boolean => checks.every((c) => !c.blocking || c.ok);

export function buildWorkflow(f: FlowInput): { steps: WorkflowStep[]; currentId: WorkflowStep["id"] } {
  const { opp, analysis: a, inputs, bid, pkg } = f;
  const rejected = a.verdict === "reject";
  const proven = a.verdict === "qualified" || a.verdict === "bid-ready";
  const price = inputs.plannedBidUsd;
  const walk = a.prices.walkAwayPriceUsd;
  const priceOk = price !== null && price > 0 && (walk === null || price >= walk - 0.005);
  const portalChecks = preflight(f, "portal");
  const ready = portalChecks.every((c) => c.ok);
  const won = bid.outcome?.result === "won";

  type Draft = Omit<WorkflowStep, "status"> & { done: boolean; blocked?: boolean };
  const drafts: Draft[] = [
    {
      id: "fit",
      title: "Check it fits your business",
      why: "Your time and cash are limited, so start with the contracts that suit your services, licenses, size and location.",
      done: a.recommendation.tier !== "not-recommended",
      blocked: a.recommendation.tier === "not-recommended",
      lines: [a.recommendation.headline, ...a.recommendation.reasons],
    },
    {
      id: "prove",
      title: "Prove the rules",
      why: "A good price means nothing if the work cannot be subcontracted, you cannot qualify, or you cannot afford to start. These rules are checked before anything else.",
      done: proven,
      blocked: rejected,
      lines: proven ? ["Every rule passes, even under cautious assumptions."] : rejected ? [a.verdictReason] : a.openQuestions.length ? a.openQuestions.slice(0, 4) : [a.verdictReason],
    },
    {
      id: "quotes",
      title: "Lock in a subcontractor",
      why: "Your price is a guess until a real subcontractor puts theirs in writing and agrees to work under your terms.",
      done: a.verdict === "bid-ready",
      lines: a.verdict === "bid-ready" ? ["A firm quote from a confirmed subcontractor backs your price."] : a.candidates.length ? [`${a.candidates.length} candidate(s) shortlisted. Request firm quotes and ask each to confirm they will work under your agreement.`] : ["Add subcontractors (or research them) and request firm quotes."],
    },
    {
      id: "price",
      title: "Set your price",
      why: "Bid high enough to keep your margin, low enough to win. The console shows the target, the walk-away line and the most you can pay the sub.",
      done: priceOk,
      lines: [
        a.prices.targetBidUsd !== null ? `Target bid ${usd(a.prices.targetBidUsd)}; walk-away ${walk !== null ? usd(walk) : "unknown"}.` : "Enter a sub price estimate to compute your target.",
        price !== null && price > 0 ? (priceOk ? `Your price: ${usd(price)}.` : `Your price ${usd(price)} is below the walk-away line.`) : "Choose a price.",
      ],
    },
    {
      id: "docs",
      title: "Prepare the documents",
      why: "The agency scores what you submit. The console drafts the cover letter, price proposal, approach, qualifications and compliance matrix from your facts, leaving a visible blank wherever it needs you.",
      done: pkg.placeholders.length === 0 && price !== null && price > 0,
      lines: pkg.placeholders.length === 0 ? ["No blanks left."] : [`${pkg.placeholders.length} blank(s) to fill in: ${pkg.placeholders.slice(0, 4).join("; ")}${pkg.placeholders.length > 4 ? "…" : ""}.`],
    },
    {
      id: "check",
      title: "Final check",
      why: "One last look at everything that could sink a bid: unproven rules, a lapsed deadline, a price below your floor, leftover blanks, an unread document.",
      done: ready,
      lines: portalChecks.every((c) => c.ok) ? ["Everything checks out."] : portalChecks.filter((c) => !c.ok).map((c) => `Still open: ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}.`).slice(0, 5),
    },
    {
      id: "submit",
      title: "Submit the bid",
      why: "Send it the way the solicitation says: by email from the console, through the agency's portal, or by your own email. Then record it so the console tracks the result.",
      done: bid.submission !== null,
      lines: bid.submission ? [`Submitted ${bid.submission.submittedOn} (${bid.submission.method.replace(/-/g, " ")}).`] : [isIsoDate(opp.dueDate) ? `Due ${opp.dueDate.slice(0, 10)}${a.daysToDeadline !== null ? ` (${a.daysToDeadline} days).` : "."}` : "No due date recorded."],
    },
    {
      id: "result",
      title: "Record the result",
      why: "Wins and losses teach the console what works for you, and a win starts the subcontractor work.",
      done: bid.outcome !== null,
      lines: bid.outcome ? [`${bid.outcome.result.replace("-", " ")} on ${bid.outcome.decidedOn}.`] : ["Waiting for the agency's decision."],
    },
    {
      id: "win",
      title: "If you win: line up the subcontractor",
      why: "Winning is only half the deal. Confirm the subcontractor, put the subcontract in writing, and make sure they are insured and ready before the notice to proceed.",
      done: false,
      lines: won ? ["You won. Research and confirm your subcontractor now."] : ["Unlocks when you record a win."],
    },
  ];

  const steps: WorkflowStep[] = [];
  let earlierOpen = false;
  for (const d of drafts) {
    let status: WorkflowStep["status"];
    if (d.done) status = "done";
    else if (d.blocked) status = "blocked";
    else if (d.id === "win") status = won ? "todo" : "locked";
    else if (earlierOpen) status = "locked";
    else status = "todo";
    if (!d.done && d.id !== "win") earlierOpen = true;
    // A submission recorded by hand is a record of fact: what comes after it no longer waits on the steps before it.
    if (d.id === "submit" && bid.submission) earlierOpen = false;
    steps.push({ id: d.id, title: d.title, why: d.why, status, lines: d.lines });
  }

  const current = steps.find((s) => s.status === "blocked") ?? steps.find((s) => s.status === "todo") ?? steps[steps.length - 1]!;
  return { steps, currentId: current.id };
}
