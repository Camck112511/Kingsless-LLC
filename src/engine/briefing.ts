/**
 * The briefing the owner gets when a bid is won: what the LLC just signed up for, what it can offer a subcontractor, and
 * who to offer it to. All numbers come from the engine's analysis. The maximum the LLC could pay is for the owner only.
 *
 * PROTECTED engine file.
 */
import type { Analysis, BidRecord, Inputs, Opportunity, RankedSub, Settings, WinBriefing } from "./types";
import { calcPricing, otherCostsFor } from "./pricing";
import { longDate, subcontractOfferScript } from "./scripts";
import { isIsoDate, pct, usd } from "./util";

export interface BriefingInput {
  opp: Opportunity;
  analysis: Analysis;
  inputs: Inputs;
  bid: BidRecord;
  settings: Settings;
  today: string;
  ranked: RankedSub[];
}

export function buildWinBriefing(i: BriefingInput): WinBriefing {
  const { opp, analysis: a, inputs, bid, settings, today, ranked } = i;
  const t = opp.terms;
  const award = bid.outcome?.awardUsd ?? bid.submission?.priceUsd ?? inputs.plannedBidUsd ?? null;
  const opening = a.pricing?.subPriceUsd ?? null;
  const maxSub = a.prices.maxSubPriceUsd;
  const profitAt = (subUsd: number | null): number | null =>
    award !== null && subUsd !== null ? calcPricing(award, subUsd, otherCostsFor(inputs.costs, subUsd, settings.contingencyRate)).profitBeforeTaxUsd : null;
  const place = [opp.location.city, opp.location.state].filter(Boolean).join(", ") || "location not stated";

  const payLine =
    t.paymentKind === "unknown" || t.paymentNetDays === null
      ? "Payment terms were not found in the listing: read the contract."
      : `${t.paymentKind === "after-acceptance" ? "Paid after acceptance" : t.paymentKind === "progress" ? "Progress payments" : t.paymentKind === "milestone" ? "Milestone payments" : "Paid after invoice"}, net ${t.paymentNetDays} days${t.retainageRate ? `, ${pct(t.retainageRate)} retainage held` : ""}.`;

  const obligations = [
    `Perform ${opp.title} for ${opp.agency || "the agency"} in ${place}, whoever does the work: you answer for it.`,
    t.insuranceRequired === "yes" ? `Carry insurance${t.insuranceMinLimitUsd ? ` of at least ${usd(t.insuranceMinLimitUsd)}` : ""} and give the agency a certificate.` : "",
    t.licensingRequired === "yes" ? "Make sure whoever performs the work holds every required license." : "",
    t.performanceBond === "yes" || t.paymentBond === "yes" ? "Provide the performance and payment bonds the contract requires." : "",
    t.subcontractShareCap !== null ? `Keep subcontracting within ${pct(t.subcontractShareCap)} of the price.` : t.subcontracting === "limited" ? "Stay within the contract's subcontracting restrictions, including any approval it requires." : "",
    "Sign the agency's contract and meet its schedule, reporting and invoicing rules.",
  ].filter(Boolean);

  const risks = [
    "If no subcontractor will take the work at your price, you are still bound to perform it.",
    ...a.warnings,
    t.rapidTurnaround === "yes" ? "The contract calls for rapid turnaround: confirm a subcontractor can mobilize that fast before you commit them." : "",
    t.retainageRate ? `${pct(t.retainageRate)} of what the agency pays is held back until completion: do not agree to pay the subcontractor faster than you are paid.` : "",
    a.cash && a.cash.peakCashRequiredUsd > 0 ? `You must put up about ${usd(a.cash.peakCashRequiredUsd)} before the agency pays.` : "",
  ].filter(Boolean);

  const top = ranked[0];
  const offerScript = subcontractOfferScript(opp, inputs, settings, opening, today);
  const nextSteps = [
    "Get the award in writing and the notice-to-proceed date.",
    ranked.length ? `Call the top candidates today, starting with ${top?.name}. Open at ${opening !== null ? usd(opening) : "your estimate"}; negotiate up only if you must, never past your maximum.` : "Research subcontractors (workspace, last step): none are on file yet.",
    "Ask each for license, certificate of insurance, availability and two references before you commit.",
    "Sign a written subcontract (have a lawyer review it) before anyone mobilizes.",
    isIsoDate(opp.dueDate) ? `The bid was due ${longDate(opp.dueDate)}; check the contract for the start and completion dates.` : "",
  ].filter(Boolean);

  return {
    generatedOn: today,
    headline: `Won: ${opp.title}${award !== null ? ` for ${usd(award)}` : ""}`,
    contract: [
      ["Agency", opp.agency || "—"],
      ["Solicitation", opp.solicitationNumber || "—"],
      ["Where", place],
      ["Award", award !== null ? usd(award) : "not recorded"],
      ["Mobilize", `about ${inputs.startLeadDays} days after notice to proceed`],
      ["Duration", inputs.durationDays ?? opp.durationDays ? `about ${inputs.durationDays ?? opp.durationDays} days` : "not stated"],
      ["Payment", payLine],
      ["First payment", a.cash ? `about day ${a.cash.daysToFirstPayment} after award` : "unknown"],
    ],
    obligations,
    risks,
    offer: { awardUsd: award, openingOfferUsd: opening, maxSubPriceUsd: maxSub, profitAtOpeningUsd: profitAt(opening), profitAtMaxUsd: profitAt(maxSub) },
    subs: ranked,
    nextSteps,
    offerMessage: { subject: offerScript.subject ?? "", body: offerScript.body },
  };
}
