/**
 * Autopilot decision rules. After the owner authorizes a bid, the server re-runs these on every pass to decide what the
 * engine may do next. The rules never loosen the engine's own: every gate must pass even in the cautious case, the price
 * must sit inside the owner's band and above the walk-away line, no blank may remain in the documents, and a bid on an
 * estimate (no firm quote) needs enough licensed, local subcontractors already on file. Anything else stops or asks.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import { isEmail } from "./bid";
import type { AnalyzeItem } from "./analyze";
import type { Analysis, BidPackage, BidRecord, Opportunity, Settings, Subcontractor } from "./types";
import { usd } from "./util";

export interface StaffingResult {
  ok: boolean;
  needed: number;
  /** Names of the subcontractors on file that qualify as plausible. */
  qualified: string[];
  detail: string;
}

/**
 * Can this job plausibly be staffed? Counts directory companies that offer the service, work in the area, have not
 * declined and (if a license is required) list one. Licenses need not be verified yet: that comes after a win.
 */
export function staffingCheck(opp: Opportunity, analysis: Analysis, subs: Subcontractor[]): StaffingResult {
  const needed = RULES.autopilot.minCandidates;
  const needsLicense = opp.terms.licensingRequired === "yes";
  const qualified = analysis.candidates.flatMap((c) => {
    const sub = subs.find((s) => s.id === c.subcontractorId);
    if (!sub || sub.willingToSubcontract === "no") return [];
    if (c.checks.find((k) => k.id === "geography")?.ok === false) return [];
    if (needsLicense && sub.licenses.length === 0) return [];
    return [sub.name];
  });
  const ok = qualified.length >= needed;
  return {
    ok,
    needed,
    qualified,
    detail: ok
      ? `${qualified.length} subcontractors on file could plausibly staff this${needsLicense ? " and list a license" : ""}.`
      : `Needs at least ${needed} subcontractors on file that offer this service, work in the area${needsLicense ? " and list the required license" : ""}; found ${qualified.length}. Research subcontractors or add them to the directory.`,
  };
}

export interface AutoCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /** True when only the owner can fix it (as opposed to something the engine will retry). */
  owner: boolean;
}

export type AutoAction = "submit" | "ready-to-upload" | "needs-you" | "stop" | "expire" | "wait";

export interface AutoDecision {
  action: AutoAction;
  checks: AutoCheck[];
  needs: string[];
  summary: string;
  recipient: string | null;
  staffing: StaffingResult;
}

export interface AutoInput {
  item: AnalyzeItem;
  bid: BidRecord;
  /** Analysis at the price the engine intends to bid. */
  analysis: Analysis;
  pkg: BidPackage;
  subs: Subcontractor[];
  emailConfigured: boolean;
  submissionsToday: number;
  /** An address the official listing states for bids, if it states one unambiguously. */
  discoveredEmail: string | null;
}

export function decide(input: AutoInput): AutoDecision {
  const { item, bid, analysis: a, pkg } = input;
  const opp = item.opportunity;
  const auth = bid.auto?.auth ?? null;
  const staffing = staffingCheck(opp, a, input.subs);
  const none = (action: AutoAction, summary: string, needs: string[] = []): AutoDecision => ({ action, checks: [], needs, summary, recipient: null, staffing });

  if (!auth) return none("stop", "Not authorized.");
  if (auth.paused) return none("wait", "Paused by you.");
  if (!auth.attestedListing) return none("stop", "Not authorized: the listing was not confirmed.");
  if (bid.submission) return none("wait", "Submitted. Watching for the result.");
  if (a.daysToDeadline !== null && a.daysToDeadline < 0) return none("expire", "The due date passed before the bid could go out.");

  const failedGate = a.gates.find((g) => g.status === "fail");
  if (failedGate) return none("stop", `Dropped: ${failedGate.label}. ${failedGate.summary}`);

  const price = item.inputs.plannedBidUsd;
  const walk = a.prices.walkAwayPriceUsd;
  const floor = Math.max(walk ?? 0, auth.floorUsd ?? 0);
  const ceiling = auth.ceilingUsd ?? a.marketPriceUsd ?? Number.POSITIVE_INFINITY;
  const recipient = [auth.submissionEmail.trim(), input.discoveredEmail ?? ""].find((e) => isEmail(e)) ?? null;
  const proven = a.verdict === "qualified" || a.verdict === "bid-ready";
  const estimateOk = a.verdict === "qualified" && auth.allowEstimateOnly && a.subPriceBasis === "estimate" && staffing.ok;

  const checks: AutoCheck[] = [
    { id: "rules", label: "Every rule is proven", ok: proven, owner: true, detail: proven ? "All rules pass, even in the cautious case." : `Not yet: ${a.gates.filter((g) => g.status !== "pass").map((g) => g.label.toLowerCase()).join("; ")}.` },
    {
      id: "proof",
      label: "A real subcontractor price backs the bid",
      ok: a.verdict === "bid-ready" || estimateOk,
      owner: true,
      detail:
        a.verdict === "bid-ready"
          ? "A firm quote from a confirmed subcontractor."
          : estimateOk
            ? `Bidding on your sub-price estimate. ${staffing.detail}`
            : !auth.allowEstimateOnly
              ? "You asked for a firm quote first. Enter one."
              : a.subPriceBasis !== "estimate"
                ? "Enter what a subcontractor is likely to charge."
                : staffing.ok
                  ? "Waiting for every rule to pass."
                  : staffing.detail,
    },
    {
      id: "price",
      label: "The price is inside your limits",
      ok: price !== null && price > 0 && price >= floor - 0.005 && price <= ceiling + 0.005,
      owner: true,
      detail:
        price === null || price <= 0
          ? "The engine has not found a price that works yet."
          : price < floor - 0.005
            ? `${usd(price)} is below the lowest allowed price of ${usd(floor)}.`
            : price > ceiling + 0.005
              ? `${usd(price)} is above the most you allowed (${usd(ceiling)}).`
              : `${usd(price)} is between ${usd(floor)} and ${Number.isFinite(ceiling) ? usd(ceiling) : "no ceiling"}.`,
    },
    { id: "blanks", label: "No blanks in the documents", ok: pkg.placeholders.length === 0, owner: true, detail: pkg.placeholders.length === 0 ? "Complete." : `Fill in under Settings or the bid workspace: ${pkg.placeholders.slice(0, 4).join("; ")}${pkg.placeholders.length > 4 ? "…" : ""}.` },
    { id: "cap", label: "Under today's submission limit", ok: input.submissionsToday < RULES.autopilot.maxSubmissionsPerDay, owner: false, detail: `${input.submissionsToday} of ${RULES.autopilot.maxSubmissionsPerDay} sent today.` },
    { id: "recipient", label: "Knows where to email the bid", ok: recipient !== null, owner: false, detail: recipient ? `Will email ${recipient}.` : "The listing does not clearly say where to email bids, and you gave no address." },
    { id: "email", label: "Email sending is set up", ok: input.emailConfigured, owner: false, detail: input.emailConfigured ? "Ready." : "RESEND_API_KEY and BID_EMAIL_FROM are not set." },
  ];

  const blockers = checks.filter((c) => c.owner && !c.ok);
  if (blockers.length > 0) {
    return { action: "needs-you", checks, needs: blockers.map((c) => c.detail), summary: `Needs you: ${blockers.map((c) => c.label.toLowerCase()).join("; ")}.`, recipient, staffing };
  }
  if (!checks.find((c) => c.id === "cap")!.ok) return { action: "wait", checks, needs: [], summary: "Daily submission limit reached; will continue tomorrow.", recipient, staffing };
  const channelOk = recipient !== null && input.emailConfigured;
  if (channelOk) return { action: "submit", checks, needs: [], summary: `Ready: emailing the bid to ${recipient}.`, recipient, staffing };
  return {
    action: "ready-to-upload",
    checks,
    needs: ["Upload the packet through the agency's portal (or email it yourself), then record it."],
    summary: recipient === null ? "Bid is complete and ready, but the agency takes bids through a portal. Upload it yourself." : "Bid is complete and ready, but email sending is not set up. Send it yourself.",
    recipient,
    staffing,
  };
}

/** The email that carries an automatically submitted bid. Plain, factual, and signed by the owner. */
export function bidEmailFor(opp: Opportunity, settings: Settings): { subject: string; message: string } {
  const c = settings.contact;
  const company = c.companyName.trim() || "Kingsless LLC";
  const sol = opp.solicitationNumber.trim();
  return {
    subject: `Bid${sol ? ` ${sol}` : ""}: ${opp.title} - ${company}`.slice(0, 200),
    message: [
      `Please find attached ${company}'s bid in response to ${sol ? `solicitation ${sol}` : "your solicitation"}, "${opp.title}".`,
      "",
      "Please confirm receipt by reply.",
      "",
      "Thank you,",
      c.contactName,
      company,
      c.phone,
    ]
      .filter((l, i, all) => l !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}

const strip = (s: string): string => s.toLowerCase().replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|the)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Does an awardee named in a public record refer to us? Exact match of the company name, ignoring LLC/Inc and punctuation. */
export function sameCompany(awardee: string, company: string, uei?: { awardee?: string; ours?: string }): boolean {
  if (uei?.awardee && uei.ours && uei.awardee.trim().toUpperCase() === uei.ours.trim().toUpperCase()) return true;
  const a = strip(awardee);
  const b = strip(company);
  return a !== "" && b !== "" && a === b;
}
