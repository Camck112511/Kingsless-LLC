/**
 * Outreach and bid drafts. Everything here is a DRAFT for human review: the app never sends these messages for you. (The one thing the console can email is the final bid packet, from the bid workspace, after a final check and a typed confirmation.)
 * The two scripts the owner specified are reproduced word for word, with only the bracketed fields filled in and
 * extra lines added for requirements that apply to this particular solicitation.
 *
 * PROTECTED engine file.
 */
import type { Analysis, Inputs, Opportunity, Settings } from "./types";
import { daysBetween, isIsoDate, usd } from "./util";

export interface Script {
  id: "quote-request" | "procurement-inquiry" | "scope-of-work" | "draft-bid" | "call-script";
  title: string;
  subject: string | null;
  body: string;
  /** Internal notes that must NOT be sent to the other party. */
  internalNotes: string | null;
}

export interface ScriptSet {
  status: "draft" | "withheld";
  banner: string;
  scripts: Script[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function longDate(iso: string | null): string {
  if (!isIsoDate(iso)) return "[date to be confirmed]";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function place(opp: Opportunity): string {
  return [opp.location.city, opp.location.state].filter(Boolean).join(", ") || "[location]";
}

function scopeLine(opp: Opportunity): string {
  const s = (opp.scope || opp.title).replace(/\s+/g, " ").trim();
  return s.length > 240 ? `${s.slice(0, 237)}...` : s;
}

/** Scope as a mid-sentence phrase: no trailing period, first letter lowered unless it starts an acronym. */
function scopeInline(opp: Opportunity): string {
  const s = scopeLine(opp).replace(/[.\s]+$/, "");
  return /^[A-Z][a-z]/.test(s) ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

function signature(settings: Settings): string {
  const c = settings.contact;
  return [c.contactName || "[Your name]", c.companyName || "[Company]", c.phone || "[Phone]", c.email || "[Email]"].join("\n");
}

function requirementLines(opp: Opportunity): string[] {
  const t = opp.terms;
  const lines: string[] = [];
  if (t.insuranceRequired === "yes") {
    lines.push(
      t.insuranceMinLimitUsd
        ? `The owner requires insurance with limits of at least ${usd(t.insuranceMinLimitUsd)}. Please confirm you can provide a certificate.`
        : "The owner requires insurance. Please send your certificate of insurance and limits.",
    );
  }
  if (t.bidBond === "yes" || t.performanceBond === "yes" || t.paymentBond === "yes") {
    lines.push("Bonding may be required. Please tell me your bonding capacity.");
  }
  if (t.licensingRequired === "yes") lines.push("Licensing applies to this work. Please send your license numbers so I can verify them.");
  return lines;
}

function quoteBy(opp: Opportunity, today: string): string {
  if (!isIsoDate(opp.dueDate)) return "[date]";
  const target = addDaysIso(opp.dueDate, -4);
  const floor = addDaysIso(today, 1);
  return longDate(target < floor ? floor : target);
}

export function generateScripts(opp: Opportunity, analysis: Analysis, inputs: Inputs, settings: Settings, today: string): ScriptSet {
  if (analysis.verdict === "reject") {
    return {
      status: "withheld",
      banner: "Outreach is withheld because this opportunity is rejected under current rules. Nothing was drafted.",
      scripts: [],
    };
  }

  const owner = opp.agency || "[project owner]";
  const sol = opp.solicitationNumber || "[solicitation number]";
  const completion = (inputs.durationDays ?? opp.durationDays) ? `within about ${inputs.durationDays ?? opp.durationDays} days of award` : "by the completion date in the solicitation documents";
  const reqs = requirementLines(opp);
  const sig = signature(settings);
  const subcontractUnknown = opp.terms.subcontracting === "unknown" || opp.terms.subcontracting === "limited";
  const paymentUnknown = opp.terms.paymentKind === "unknown" || opp.terms.paymentNetDays === null;

  /* --- A. Request for a subcontractor quote (owner's wording) --- */
  const quoteRequest: Script = {
    id: "quote-request",
    title: "Request for a subcontractor quote",
    subject: `Pricing inquiry: ${opp.title} (${place(opp)})`,
    body: [
      `Hi, I'm evaluating a project for ${owner} involving ${scopeInline(opp)} in ${place(opp)}.`,
      "",
      `I'm looking for an established contractor who can complete the specified work ${completion}. Could you review the scope and provide a firm quote that includes labor, materials, equipment, mobilization, insurance requirements, exclusions, and your payment terms?`,
      "",
      "Please also confirm your availability, relevant qualifications, and whether you'd be willing to perform the work under a subcontract agreement if the project is awarded.",
      ...(reqs.length ? ["", ...reqs] : []),
      "",
      "Please also state any deposit or mobilization payment you require, and whether you would accept payment after I am paid by the owner.",
      "",
      `Solicitation ${sol} is due ${longDate(opp.dueDate)}, so I would need your quote by ${quoteBy(opp, today)}.`,
      "",
      "I'm collecting quotes before finalizing a bid, so this is a pricing inquiry rather than a commitment to award the work.",
      "",
      sig,
    ].join("\n"),
    internalNotes: null,
  };

  /* --- B. Initial customer / procurement inquiry (owner's wording) --- */
  const covered = new Set(["subcontracting", "payment-timing"]);
  const extraQuestions = analysis.gates
    .filter((g) => g.status === "unknown" && !covered.has(g.id))
    .flatMap((g) => g.questions)
    .filter((q, i, all) => all.indexOf(q) === i);
  const inquiryParts = [`Hello, I'm reviewing solicitation ${sol} for ${opp.title}.`, ""];
  if (subcontractUnknown) {
    inquiryParts.push(
      "Before submitting a proposal, I'd like to confirm whether a prime contractor may use qualified subcontractors to perform some or all of the required scope, and whether any prior-performance, licensing, insurance, bonding, or subcontractor-disclosure requirements apply.",
      "",
    );
  }
  if (paymentUnknown) {
    inquiryParts.push(
      "Could you also direct me to the applicable contract terms governing invoicing, acceptance, milestone payments, retainage, and payment deadlines?",
      "",
    );
  }
  if (extraQuestions.length) {
    inquiryParts.push("I also want to confirm a few specifics:", ...extraQuestions.map((q) => `- ${q}`), "");
  }
  if (!subcontractUnknown && !paymentUnknown && !extraQuestions.length) {
    inquiryParts.push("I have no open questions at this time; no inquiry is needed unless something changes.", "");
  }
  inquiryParts.push("Thank you for your guidance.", "", sig);
  const inquiry: Script = {
    id: "procurement-inquiry",
    title: "Initial customer / procurement inquiry",
    subject: `Question regarding solicitation ${sol}`,
    body: inquiryParts.join("\n"),
    internalNotes: "Send through the portal's official question channel if the solicitation names one; many agencies require all questions there.",
  };

  /* --- C. Scope of work for subcontractors --- */
  const sow: Script = {
    id: "scope-of-work",
    title: "Scope-of-work package for subcontractors (draft)",
    subject: `Scope of work: ${opp.title}`,
    body: [
      "REQUEST FOR PRICING: NOT AN OFFER OR AWARD",
      "",
      `Project: ${opp.title}`,
      `Owner: ${owner}`,
      `Solicitation: ${sol}`,
      `Location: ${place(opp)}`,
      `Proposal due to owner: ${longDate(opp.dueDate)}`,
      `Your quote needed by: ${quoteBy(opp, today)}`,
      "",
      "1. Scope",
      scopeLine(opp),
      "(Attach or link the owner's solicitation documents; the documents control over this summary.)",
      "",
      "2. Period of performance",
      `Mobilization about ${inputs.startLeadDays} days after award; duration ${inputs.durationDays ?? opp.durationDays ?? "to be confirmed"}${inputs.durationDays ?? opp.durationDays ? " days" : ""}.`,
      "",
      "3. Requirements that flow down to you",
      ...(reqs.length ? reqs.map((r) => `- ${r}`) : ["- To be confirmed from the solicitation documents."]),
      "",
      "4. Please price (itemized)",
      "- Labor",
      "- Materials",
      "- Equipment",
      "- Mobilization / demobilization",
      "- Insurance and any bond costs",
      "- Exclusions and assumptions",
      "",
      "5. Terms I am asking about",
      "- Your payment terms, any deposit, and whether payment after the owner pays me is acceptable",
      "- Quote validity period",
      "- Willingness to perform under a written subcontract agreement",
      "",
      sig,
    ].join("\n"),
    internalNotes: null,
  };

  /* --- D. Draft bid --- */
  const price = inputs.plannedBidUsd ?? analysis.prices.targetBidUsd;
  const bid: Script = {
    id: "draft-bid",
    title: "Draft bid outline",
    subject: `Proposal: solicitation ${sol}`,
    body: [
      `PROPOSAL FOR SOLICITATION ${sol}: ${opp.title}`,
      `Submitted to: ${owner}`,
      `Submitted by: ${settings.contact.companyName || "[Company]"}`,
      "",
      "1. Understanding of the work",
      scopeLine(opp),
      "",
      "2. Approach",
      "[Company] will manage delivery as prime contractor, using qualified, insured subcontractors where the solicitation permits. Subcontractors will be disclosed as the solicitation requires.",
      "",
      "3. Price",
      price !== null ? `Lump sum: ${usd(price)} [DRAFT: confirm before submitting].` : "[Price to be set after firm subcontractor quotes are received.]",
      "",
      "4. Schedule",
      `Mobilization about ${inputs.startLeadDays} days after award. [Confirm against the quoted subcontractor's availability.]`,
      "",
      "5. Compliance checklist",
      ...analysis.gates.map((g) => `- ${g.label}: ${g.status === "pass" ? "met" : g.status === "fail" ? "NOT MET" : "to confirm"}`),
      "",
      "6. Attachments to prepare",
      "- Certificates of insurance, W-9, references, any required forms and subcontractor disclosures",
    ].join("\n"),
    internalNotes: [
      "INTERNAL ONLY. Remove before sending.",
      analysis.pricing ? `Sub price ${usd(analysis.pricing.subPriceUsd)}; profit before tax ${usd(analysis.pricing.profitBeforeTaxUsd)} (${(analysis.pricing.netMarginRate * 100).toFixed(1)}%).` : "No economics yet.",
      analysis.prices.walkAwayPriceUsd !== null ? `Walk-away price ${usd(analysis.prices.walkAwayPriceUsd)}.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  /* --- E. Call script --- */
  const call: Script = {
    id: "call-script",
    title: "Phone script for a subcontractor",
    subject: null,
    body: [
      `"Hi, this is ${settings.contact.contactName || "[name]"} with ${settings.contact.companyName || "[company]"}. I'm pricing a ${opp.title} project for ${owner} in ${place(opp)}. Do you have two minutes?"`,
      "",
      "Ask, in this order, and write down the answers:",
      "1. Do you do this kind of work in this area, and can you meet the dates?",
      "2. Have you done similar projects? Can I get two references?",
      "3. What licenses and insurance do you carry? Can you send certificates?",
      "4. Will you work as a subcontractor under a written agreement if I am awarded?",
      "5. What is your firm price for this scope, what is included, and what is excluded?",
      "6. What deposit do you need, and would you accept payment after I am paid by the owner?",
      "",
      `"I'm gathering quotes now; this is a pricing request, not a commitment. I'd need your written quote by ${quoteBy(opp, today)}. Where should I send the scope?"`,
    ].join("\n"),
    internalNotes: "Record answers in the subcontractor directory and mark each item verified only when you have seen evidence.",
  };

  const daysLeft = isIsoDate(opp.dueDate) ? daysBetween(today, opp.dueDate) : null;
  // The owner's rule: no subcontractor outreach until subcontracting and prime eligibility are proven.
  const hardGateOpen = analysis.gates.some((g) => g.hard && g.id !== "financing" && g.status === "unknown");
  const days = daysLeft !== null ? ` ${daysLeft} day(s) to the due date.` : "";
  return {
    status: "draft",
    banner: hardGateOpen
      ? `DRAFT: only the procurement inquiry is available. Subcontractor outreach stays locked until the solicitation confirms subcontracting is allowed and you can qualify as prime. This app never sends these messages for you.${days}`
      : `DRAFTS: review and edit before sending. This app never sends these messages for you.${days}`,
    scripts: hardGateOpen ? [inquiry] : [quoteRequest, inquiry, sow, bid, call],
  };
}
