/**
 * The bid package: the documents that go to the buyer, plus the internal papers that stay with the company.
 *
 * Everything here is built from facts the engine already holds (the listing, the company profile, the bid price the owner
 * chose, the owner's own wording). Nothing is invented: a fact the owner has not supplied becomes a visible marker such as
 * "[Company address – to complete]", and the package is not "ready" while any marker remains. Documents never reveal what
 * the company pays its subcontractor, its margin, or its cash position.
 *
 * Documents are structured content (DocBlock). The server renders them to Word and PDF.
 *
 * PROTECTED engine file.
 */
import { RULES } from "./config";
import { longDate } from "./scripts";
import type { Analysis, BidDocument, BidPackage, BidRecord, DocBlock, Inputs, Opportunity, ServiceCategory, Settings } from "./types";
import { daysBetween, isIsoDate, pct, usd } from "./util";

export interface BidContext {
  opp: Opportunity;
  analysis: Analysis;
  inputs: Inputs;
  bid: BidRecord;
  settings: Settings;
  today: string;
}

const PH = /\[([^\]\n]{2,80}) – to complete\]/g;

/** A visible "owner must fill this in" marker. Found again by findPlaceholders. */
export const ph = (label: string): string => `[${label} – to complete]`;

export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PH)].map((m) => m[1] as string);
}

function textOf(blocks: DocBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "h":
        case "p":
        case "note":
          return b.text;
        case "bullets":
          return b.items.join("\n");
        case "table":
          return [...b.head, ...b.rows.flat()].join("\n");
        case "kv":
          return b.rows.map((r) => r.join(" ")).join("\n");
        case "sig":
          return b.lines.join("\n");
      }
    })
    .join("\n");
}

/** FNV-1a fingerprint of the words in the documents that go to the agency. */
function digestOf(docs: BidDocument[]): string {
  let h = 0x811c9dc5;
  for (const ch of docs.map((d) => `${d.id}\n${textOf(d.blocks)}`).join("\n\n")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const exact = (n: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const H1 = (text: string): DocBlock => ({ t: "h", text, level: 1 });
const H2 = (text: string): DocBlock => ({ t: "h", text, level: 2 });
const P = (text: string): DocBlock => ({ t: "p", text });

const APPROACH: Record<ServiceCategory, string[]> = {
  supply: [
    "Confirm quantities, specifications and delivery requirements against the solicitation before ordering.",
    "Source from established suppliers and manufacturers, and confirm stock and lead times in writing.",
    "Inspect goods on receipt and again before delivery for quantity, condition and conformance to the specification.",
    "Deliver to the stated location within the required time and obtain a signed delivery acknowledgement.",
    "Resolve any non-conforming or damaged goods promptly at no cost to the agency.",
  ],
  "construction-general": [
    "Submit the schedule, safety plan and certificates of insurance the contract requires before mobilizing.",
    "Mobilize qualified crews and equipment promptly after notice to proceed.",
    "Perform the work in the sequence the scope requires, with a responsible supervisor on site or in daily contact.",
    "Control dust, erosion, traffic and site safety as the contract and applicable regulations require.",
    "Inspect the work against the specification at each stage and correct deficiencies before the agency's inspection.",
    "Clean the site, demobilize, and deliver closeout documents (warranties, as-built information, releases).",
  ],
  "construction-specialty": [
    "Confirm the trade scope, applicable codes and any required permits before work begins.",
    "Assign licensed, insured tradespeople with the experience this scope requires.",
    "Coordinate access, utilities and schedule with the agency's representative before mobilizing.",
    "Inspect completed work against the specification and applicable code before requesting acceptance.",
    "Deliver closeout documents, warranties and any required certifications.",
  ],
  "security-guard": [
    "Confirm post locations, hours and duties, and write post orders that match the solicitation.",
    "Assign only licensed and background-checked officers, and keep licensing records current.",
    "Supervise officers, maintain daily activity logs and report incidents to the agency promptly.",
    "Maintain a coverage plan so every shift is filled, including absences and emergencies.",
    "Review performance with the agency regularly and correct any shortfall at once.",
  ],
  "facility-services": [
    "Walk the site or review the scope to confirm areas, frequencies and standards before the start date.",
    "Assign trained crews and supply the equipment, materials and supplies the scope requires.",
    "Follow a written schedule and checklist for each visit, and record completion.",
    "Inspect the work routinely against the contract standard and correct deficiencies promptly.",
    "Provide a single point of contact for the agency to report concerns and request changes.",
  ],
  "professional-services": [
    "Confirm deliverables, standards and milestones with the agency at kickoff.",
    "Assign qualified professionals with the credentials the scope requires.",
    "Review deliverables for quality and completeness before submitting them.",
    "Report progress at the intervals the agency specifies and respond promptly to comments.",
  ],
  "other-services": [
    "Confirm the requirements, standards and schedule with the agency before starting.",
    "Assign qualified personnel and the equipment the scope requires.",
    "Perform the work to the contract standard and document completion.",
    "Inspect results, correct any deficiency promptly and deliver all required records.",
  ],
  unknown: [
    "Confirm the requirements, standards and schedule with the agency before starting.",
    "Assign qualified personnel and the equipment the scope requires.",
    "Perform the work to the contract standard and document completion.",
  ],
};

export function buildBidPackage(ctx: BidContext): BidPackage {
  const { opp, analysis, inputs, bid, settings, today } = ctx;
  const c = settings.contact;
  const p = settings.profile;
  const t = opp.terms;
  const company = c.companyName.trim() || ph("Company legal name");
  const signer = bid.prep.signerName.trim() || c.contactName.trim() || ph("Signer name");
  const signerTitle = bid.prep.signerTitle.trim() || c.title?.trim() || ph("Signer title");
  const address = c.address?.trim() || ph("Company mailing address");
  const phone = c.phone.trim() || ph("Company phone");
  const email = c.email.trim() || ph("Company email");
  const price = inputs.plannedBidUsd !== null && inputs.plannedBidUsd > 0 ? inputs.plannedBidUsd : null;
  const priceText = price === null ? ph("Bid price") : exact(price);
  const solNo = opp.solicitationNumber.trim() || ph("Solicitation number");
  const agency = opp.agency.trim() || ph("Agency name");
  const validity = bid.prep.validityDays;
  const due = isIsoDate(opp.dueDate) ? longDate(opp.dueDate) : ph("Due date");
  const place = [opp.location.city, opp.location.state].filter(Boolean).join(", ");
  const subAllowed = t.subcontracting !== "prohibited";

  const quotedSub = analysis.candidates.find((k) => k.quote !== null);

  const signature = (): DocBlock => ({ t: "sig", lines: ["Sincerely,", "", "______________________________", signer, signerTitle, company, phone, email] });

  /* ------------------------------- 01 cover letter ------------------------------- */
  const cover: BidDocument = {
    id: "cover-letter",
    filename: "01-Cover-Letter",
    title: "Cover letter",
    audience: "agency",
    purpose: "Introduces your bid, states the price and how long it stays open, and lists what is enclosed.",
    blocks: [
      P(longDate(today)),
      P(`${agency}\nProcurement / Purchasing`),
      P(`Re: ${solNo}: ${opp.title}`),
      P("Dear Procurement Officer,"),
      P(
        `${company} respectfully submits this bid in response to the above solicitation${place ? ` for work in ${place}` : ""}. Our firm fixed price for all work described in the solicitation is ${priceText}. This offer remains open for ${validity} days after the bid due date of ${due}.`,
      ),
      P(
        `${company} will be fully responsible to the agency for performance of the entire contract, including quality, schedule, insurance and compliance. ${subAllowed ? "Where the solicitation permits, we perform through qualified, licensed and insured subcontractors whom we select, manage and pay, under written subcontracts that carry the contract's requirements." : ""}`.trim(),
      ),
      P("This submission includes:"),
      { t: "bullets", items: ["Price proposal", "Technical approach and scope of work", "Company qualifications", ...(subAllowed ? ["Subcontracting statement"] : []), "Compliance matrix"] },
      P(`Please direct questions about this bid to ${signer} at ${phone} or ${email}. Thank you for the opportunity to bid.`),
      signature(),
    ],
  };

  /* -------------------------------- 02 price proposal ---------------------------- */
  const paymentLine =
    t.paymentKind === "unknown" || t.paymentNetDays === null
      ? "We accept the payment terms stated in the solicitation."
      : `We accept the payment terms stated in the solicitation (${t.paymentKind === "after-acceptance" ? "payment after acceptance" : t.paymentKind === "progress" ? "progress payments" : t.paymentKind === "milestone" ? "milestone payments" : "payment after invoice"}, net ${t.paymentNetDays} days).`;
  const pricing: BidDocument = {
    id: "price-proposal",
    filename: "02-Price-Proposal",
    title: "Price proposal",
    audience: "agency",
    purpose: "Your offered price and its terms. If the agency supplies its own bid form, copy this total into it.",
    blocks: [
      H1("Price proposal"),
      { t: "kv", rows: [["Solicitation", `${solNo}: ${opp.title}`], ["Agency", agency], ["Bidder", company], ["Date", longDate(today)], ["Offer valid for", `${validity} days after the bid due date (${due})`]] },
      H2("Bid price"),
      {
        t: "table",
        head: ["Item", "Description", "Total price"],
        rows: [["1", `All labor, materials, equipment, supervision, mobilization, insurance and incidentals to complete the work described in ${solNo}.`, priceText]],
        widths: [10, 65, 25],
      },
      P(`Total firm fixed price: ${priceText}`),
      H2("Terms"),
      { t: "bullets", items: [`This price is firm for ${validity} days after the bid due date.`, paymentLine, "The price includes everything needed to perform the work as described, unless the solicitation states otherwise.", "No exceptions or conditions are taken to the solicitation."] },
      { t: "note", text: "If the solicitation includes its own bid form or bid schedule, complete that form with the total above and submit it with this package. Where the agency requires unit prices, attach them to that form." },
      { t: "sig", lines: ["______________________________", signer, signerTitle, company] },
    ],
  };

  /* ------------------------------- 03 technical approach ------------------------- */
  const startDays = inputs.startLeadDays;
  const duration = inputs.durationDays ?? opp.durationDays;
  const approachBlocks: DocBlock[] = bid.prep.approach.trim()
    ? bid.prep.approach
        .trim()
        .split(/\n{2,}/)
        .map((para): DocBlock => P(para.trim()))
    : [{ t: "bullets", items: APPROACH[opp.category] }];
  const technical: BidDocument = {
    id: "technical-approach",
    filename: "03-Technical-Approach",
    title: "Technical approach and scope of work",
    audience: "agency",
    purpose: "Shows the agency you understand the work and how it will be done. Replace the draft with your own words if you can.",
    blocks: [
      H1("Technical approach and scope of work"),
      H2("Understanding of the requirement"),
      P(opp.scope.trim() ? `The agency requires: ${opp.scope.trim().slice(0, 1200)}` : ph("Short description of the work, in the agency's words")),
      H2("Approach"),
      ...approachBlocks,
      H2("Schedule"),
      P(`We can begin approximately ${startDays} days after notice to proceed${duration ? ` and expect to complete the work in about ${duration} days from start` : `. ${ph("Expected completion time")}`}. We will confirm the final schedule with the agency before work starts.`),
      H2("Management and communication"),
      P(`${signer} will be the single point of contact and is responsible for the contract from award through closeout. We report progress to the agency's representative as the contract requires and respond to questions the same business day.`),
      ...(subAllowed
        ? [
            H2("Managing subcontractors"),
            {
              t: "bullets",
              items: [
                "Subcontractors are selected for the specific scope, licensed where required, insured, and have references we have checked.",
                "Each works under a written subcontract that carries this contract's requirements, insurance and schedule.",
                `${company} supervises the work and remains responsible to the agency for it.`,
              ],
            } as DocBlock,
          ]
        : []),
      H2("Quality and safety"),
      P("Work is checked against the specification before it is offered for acceptance. Safety rules in the solicitation and applicable regulations are followed on every visit."),
    ],
  };

  /* ------------------------------ 04 company qualifications ---------------------- */
  const certs = [p.smallBusiness ? "Small business" : "", ...p.certifications.map((x) => x.toUpperCase())].filter(Boolean);
  const refs = Math.max(0, p.pastPerformanceCount);
  const refRows: string[][] = Array.from({ length: Math.max(1, Math.min(refs, 5)) }, (_, i) =>
    refs === 0 ? ["None to list yet", "", "", ""] : [ph(`Project ${i + 1} name and client`), ph("Value"), ph("Year"), ph("Reference name and phone")],
  );
  const quals: BidDocument = {
    id: "qualifications",
    filename: "04-Company-Qualifications",
    title: "Company qualifications",
    audience: "agency",
    purpose: "Who you are: registration, licenses, insurance and experience. Everything here comes from your Settings.",
    blocks: [
      H1("Company qualifications"),
      { t: "kv", rows: [
        ["Company", company],
        ["Address", address],
        ["Contact", `${signer}, ${signerTitle}`],
        ["Phone / email", `${phone} / ${email}`],
        ["Website", c.website?.trim() || "—"],
        ["SAM.gov registration", p.samRegistered ? `Active${c.uei?.trim() ? `, UEI ${c.uei.trim()}` : ` (${ph("UEI")})`}${c.cage?.trim() ? `, CAGE ${c.cage.trim()}` : ""}` : "Not registered"],
        ["Business status", certs.length ? certs.join(", ") : "—"],
        ["Years in business", String(p.yearsInBusiness)],
        ["Licenses", p.licenses.length ? p.licenses.join("; ") : "None required for the company itself unless the solicitation states otherwise; licensed subcontractors perform licensed work."],
        ["General liability insurance", p.insuranceCoverageUsd > 0 ? `${usd(p.insuranceCoverageUsd)} limit` : "Will be bound before award if required"],
        ["Bonding capacity", p.bondingCapacityUsd > 0 ? usd(p.bondingCapacityUsd) : "None"],
      ] },
      H2("About the company"),
      P(c.capability?.trim() || ph("Two or three sentences describing what the company does")),
      H2("Past performance"),
      refs === 0
        ? P("The company is newly established and has no completed projects to cite yet. It manages each contract with qualified subcontractors that have relevant experience, whose references are checked before award.")
        : { t: "table", head: ["Project / client", "Value", "Year", "Reference"], rows: refRows, widths: [40, 15, 10, 35] },
    ],
  };

  /* ----------------------------- 05 subcontracting statement --------------------- */
  const cap = t.subcontractShareCap;
  const setAsideCapNote =
    cap === null && ["small-business", "8a", "sdvosb", "wosb", "hubzone"].includes(t.setAside)
      ? ` As a set-aside award, the limitations on subcontracting in 13 CFR 125.6 also apply; the typical limit for this kind of work is ${pct(RULES.setAsideSubcontractCap[opp.category])}. ${ph("Confirm the limit in the solicitation clause")}`
      : "";
  const subs: BidDocument | null = subAllowed
    ? {
        id: "subcontracting",
        filename: "05-Subcontracting-Statement",
        title: "Subcontracting statement",
        audience: "agency",
        purpose: "States how subcontractors will be used and that you stay within any limit. It names no one unless the solicitation requires it.",
        blocks: [
          H1("Subcontracting statement"),
          P(`${company} will perform this contract as the prime contractor and remain fully responsible to the agency for all work, including work performed by subcontractors.`),
          P(
            cap !== null
              ? `The solicitation limits subcontracting to ${pct(cap)} of the contract price. Our plan stays within that limit.`
              : t.subcontracting === "limited"
                ? `The solicitation restricts subcontracting. ${ph("State how the plan meets the solicitation's subcontracting limit or approval requirement")}`
                : "The solicitation permits subcontracting. Any subcontractor will be licensed where the work requires it, insured, and engaged under a written subcontract.",
          ),
          ...(setAsideCapNote ? [P(setAsideCapNote.trim())] : []),
          t.subcontracting === "limited"
            ? ({ t: "table", head: ["Subcontractor", "Scope", "Status"], rows: [[quotedSub ? quotedSub.name : ph("Subcontractor name"), "As described in the technical approach", quotedSub ? "Quote received; subject to award" : "To be confirmed"]], widths: [35, 40, 25] } as DocBlock)
            : P("Subcontractors, if used, will be identified to the agency or approved by it whenever the solicitation requires, before they begin work."),
        ],
      }
    : null;

  /* --------------------------------- 06 compliance matrix ------------------------ */
  const row = (req: string, resp: string, doc: string): string[] => [req, resp, doc];
  const rows: string[][] = [];
  if (opp.source === "sam.gov" || opp.level === "federal") {
    rows.push(row("Active SAM.gov registration", p.samRegistered ? `Active${c.uei?.trim() ? `, UEI ${c.uei.trim()}` : ""}` : "Not registered", "Qualifications"));
  }
  rows.push(
    row(
      "Set-aside / eligibility",
      t.setAside === "none" ? "Open competition" : t.setAside === "unknown" ? ph("Confirm set-aside status") : `${t.setAside.toUpperCase()}: ${t.setAside === "small-business" ? (p.smallBusiness ? "we qualify as a small business" : "does not qualify") : p.certifications.includes(t.setAside) ? "we hold this certification" : "does not qualify"}`,
      "Qualifications",
    ),
  );
  if (t.insuranceRequired === "yes") {
    rows.push(row("Insurance", `${t.insuranceMinLimitUsd ? `Required: ${usd(t.insuranceMinLimitUsd)}. ` : ""}We carry ${p.insuranceCoverageUsd > 0 ? `${usd(p.insuranceCoverageUsd)}` : "none today"}. ${ph("Attach certificate of insurance")}`, "Attachment"));
  }
  for (const [label, v] of [["Bid bond", t.bidBond], ["Performance bond", t.performanceBond], ["Payment bond", t.paymentBond]] as const) {
    if (v === "yes") rows.push(row(label, p.bondingCapacityUsd > 0 ? `Bonding capacity ${usd(p.bondingCapacityUsd)}. ${ph(`Attach ${label.toLowerCase()}`)}` : "No bonding capacity", "Attachment"));
  }
  if (t.licensingRequired === "yes") rows.push(row("Licensing", p.licenses.length ? p.licenses.join("; ") : ph("Which license and who holds it"), "Qualifications"));
  if (t.pastPerformance === "required" || t.pastPerformance === "scored") rows.push(row("Past performance", p.pastPerformanceCount > 0 ? `${p.pastPerformanceCount} reference(s) listed` : "None to cite yet", "Qualifications"));
  if (t.minYearsExperience !== null) rows.push(row(`${t.minYearsExperience} years of experience`, `${p.yearsInBusiness} years in business`, "Qualifications"));
  if (t.mandatoryPreBid === "yes") rows.push(row("Mandatory pre-bid meeting", ph(`Confirm attendance${t.preBidDate ? ` (${t.preBidDate})` : ""}`), "Attachment"));
  rows.push(row("Subcontracting", t.subcontracting === "prohibited" ? "Not used" : cap !== null ? `Within the ${pct(cap)} limit` : "Permitted; see statement", subAllowed ? "Subcontracting statement" : "—"));
  rows.push(row("Payment terms", paymentLine.replace("We accept", "Accepted:").replace(/\.$/, ""), "Price proposal"));
  if (t.rapidTurnaround === "yes") rows.push(row("Rapid turnaround", ph("How you meet the quick-delivery requirement"), "Technical approach"));
  const matrix: BidDocument = {
    id: "compliance-matrix",
    filename: "06-Compliance-Matrix",
    title: "Compliance matrix",
    audience: "agency",
    purpose: "A one-page answer to every requirement the engine found, so the evaluator sees you meet them.",
    blocks: [
      H1("Compliance matrix"),
      P(`${solNo}: ${opp.title}`),
      { t: "table", head: ["Requirement", "Our response", "Where addressed"], rows, widths: [28, 52, 20] },
      { t: "note", text: "Built from the requirements the engine found in the listing. If the solicitation lists other requirements, add a row for each." },
    ],
  };

  const agencyDocs = [cover, pricing, technical, quals, ...(subs ? [subs] : []), matrix];
  const placeholders = [...new Set(agencyDocs.flatMap((d) => findPlaceholders(textOf(d.blocks))))];

  /* ------------------------------- internal: bid summary ------------------------- */
  const a = analysis;
  const dueIn = a.daysToDeadline;
  const summary: BidDocument = {
    id: "bid-summary",
    filename: "Bid-Summary",
    title: "Bid summary (internal)",
    audience: "internal",
    purpose: "Your private one-pager: price, margin, cash, risks and the walk-away line. Never sent to the agency.",
    blocks: [
      H1("Bid summary (internal: do not send)"),
      { t: "kv", rows: [
        ["Opportunity", `${solNo}: ${opp.title}`],
        ["Agency", agency],
        ["Due", `${due}${dueIn !== null ? ` (${dueIn} days)` : ""}`],
        ["Engine verdict", `${a.verdict.toUpperCase()}: ${a.verdictReason}`],
        ["Recommendation", `${a.recommendation.headline}. Business fit ${a.fit.score}/100`],
      ] },
      H2("Price"),
      { t: "kv", rows: [
        ["Bid price chosen", price === null ? "Not set" : exact(price)],
        ["Target bid", a.prices.targetBidUsd === null ? "—" : exact(a.prices.targetBidUsd)],
        ["Walk-away price", a.prices.walkAwayPriceUsd === null ? "—" : exact(a.prices.walkAwayPriceUsd)],
        ["Expected market price", a.marketPriceUsd === null ? "—" : exact(a.marketPriceUsd)],
        ["Most you can pay the sub", a.prices.maxSubPriceUsd === null ? "—" : exact(a.prices.maxSubPriceUsd)],
      ] },
      H2("Economics at the chosen price"),
      a.pricing
        ? { t: "kv", rows: [
            ["Subcontractor cost", `${exact(a.pricing.subPriceUsd)} (${a.subPriceBasis === "firm-quote" ? "firm quote" : "estimate"})${quotedSub ? `: ${quotedSub.name}` : ""}`],
            ["Other costs", exact(a.pricing.otherCostsUsd)],
            ["Profit before tax", `${exact(a.pricing.profitBeforeTaxUsd)} (${pct(a.pricing.netMarginRate, 1)} margin)`],
            ["Peak cash you must put up", a.cash ? exact(a.cash.peakCashRequiredUsd) : "—"],
            ["First payment", a.cash ? `about day ${a.cash.daysToFirstPayment} after award` : "—"],
            ["Win chance (heuristic)", `${pct(a.winProbability.value)}; expected profit ${a.expectedProfitUsd === null ? "—" : exact(a.expectedProfitUsd)}`],
          ] }
        : P("Economics are not computable yet: add a sub price and a market price."),
      H2("Rules"),
      { t: "table", head: ["Rule", "Status", "Why"], rows: a.gates.map((g) => [g.label, g.status.toUpperCase(), g.summary]), widths: [30, 12, 58] },
      ...(a.warnings.length ? [H2("Warnings"), { t: "bullets", items: a.warnings } as DocBlock] : []),
      ...(a.openQuestions.length ? [H2("Still unanswered"), { t: "bullets", items: a.openQuestions } as DocBlock] : []),
      H2("Walk away if"),
      { t: "bullets", items: [
        "A firm subcontractor quote comes in above the most you can pay.",
        "The solicitation turns out to restrict subcontracting in a way you did not see.",
        "You would have to put up more cash than you have before you are paid.",
      ] },
    ],
  };

  /* ---------------------------- internal: submission checklist ------------------- */
  const forms = [
    "Signed copies of the documents above (signature blocks)",
    "Any bid form, bid schedule or addenda acknowledgement the solicitation includes",
    ...(t.insuranceRequired === "yes" ? ["Certificate of insurance"] : []),
    ...(t.bidBond === "yes" ? ["Bid bond"] : []),
    ...(t.mandatoryPreBid === "yes" ? ["Proof of pre-bid meeting attendance, if the solicitation asks for it"] : []),
    "Forms the agency commonly asks for (W-9, vendor registration, conflict-of-interest or ownership disclosure, affirmations). Include only what THIS solicitation lists",
  ];
  const checklist: BidDocument = {
    id: "submission-checklist",
    filename: "Submission-Checklist",
    title: "Submission checklist (internal)",
    audience: "internal",
    purpose: "What to attach and do on the day, in order. The engine cannot know which extra forms a particular agency wants: read the solicitation's instructions.",
    blocks: [
      H1("Submission checklist (internal: do not send)"),
      P(`${solNo}: ${opp.title}. Due ${due}.`),
      H2("Before you submit"),
      { t: "bullets", items: [
        "Read the solicitation's instructions to bidders once more, start to finish.",
        "Check for addenda or amendments posted since you last looked.",
        "Replace every [ … – to complete] marker; none may remain.",
        ...forms,
        "Submit early: portals and email can fail at the deadline.",
      ] },
      H2("How to submit"),
      P(opp.sourceUrl ? `Official listing: ${opp.sourceUrl}` : ph("Where bids are submitted")),
      H2("After you submit"),
      { t: "bullets", items: ["Save the confirmation number or email receipt and record it in the console.", "Put the bid opening date on your calendar.", "Keep your subcontractor quote valid through the offer period (ask them to hold it).", "If you win, return to the console and start the subcontractor step."] },
    ],
  };

  /* ----------------------- for the subcontractor: term sheet --------------------- */
  const won = bid.outcome?.result === "won";
  const q = quotedSub?.quote ?? null;
  const subName = quotedSub?.name ?? ph("Subcontractor legal name");
  const payLine = !q
    ? ph("Payment terms agreed with the subcontractor")
    : q.terms.kind === "pay-when-paid"
      ? `Paid within ${q.terms.netDays || 10} days after ${company} is paid by the agency for the related work (pay-when-paid).`
      : q.terms.kind === "deposit-balance"
        ? `${pct(q.terms.depositRate)} deposit at mobilization; the balance ${q.terms.netDays ? `${q.terms.netDays} days after` : "on"} completion and acceptance.`
        : q.terms.kind === "net"
          ? `Paid net ${q.terms.netDays} days after each approved invoice.`
          : `Paid ${q.terms.netDays ? `${q.terms.netDays} days after` : "on"} completion and acceptance.`;
  const term: BidDocument | null =
    subAllowed && (quotedSub || won)
      ? {
          id: "subcontract-term-sheet",
          filename: "Subcontract-Term-Sheet",
          title: "Subcontract term sheet (draft)",
          audience: "subcontractor",
          purpose: "A plain-language summary of the deal to send your subcontractor before the real subcontract is signed. Never includes what the agency pays you.",
          blocks: [
            H1("Subcontract term sheet (draft for discussion)"),
            { t: "kv", rows: [
              ["Contractor", `${company}, ${address}`],
              ["Subcontractor", subName],
              ["Prime contract", `${solNo}: ${opp.title} (${agency})`],
              ["Place of work", place || ph("Place of work")],
              ["Date", longDate(today)],
            ] },
            H2("Scope of work"),
            P(opp.scope.trim() ? opp.scope.trim().slice(0, 1200) : ph("Scope of work")),
            P("The subcontractor performs the portion of the prime contract described above, to the standards in the prime contract documents. A copy of the relevant solicitation sections will be provided."),
            H2("Price and payment"),
            { t: "kv", rows: [
              ["Subcontract price", q ? exact(q.amountUsd) : ph("Agreed subcontract price")],
              ["Payment", payLine],
              ["Includes", q ? [q.includes.labor && "labor", q.includes.materials && "materials", q.includes.equipment && "equipment", q.includes.mobilization && "mobilization", q.includes.insurance && "insurance"].filter(Boolean).join(", ") || "as quoted" : ph("What the price includes")],
              ["Excludes", q?.exclusions.trim() || "Nothing beyond what the quote states"],
            ] },
            H2("Schedule"),
            P(`Mobilize about ${startDays} days after ${company} receives notice to proceed${duration ? `; complete in about ${duration} days` : `; ${ph("completion date")}`}. Time is important: the subcontractor will tell ${company} at once about anything that may cause delay.`),
            H2("Insurance, licensing and compliance"),
            { t: "bullets", items: [
              `General liability insurance of at least ${t.insuranceMinLimitUsd ? usd(t.insuranceMinLimitUsd) : ph("minimum limit")}, plus workers' compensation as the law requires, with ${company} named as additional insured where the prime contract requires it. Certificate delivered before mobilization.`,
              t.licensingRequired === "yes" ? `Subcontractor holds the licenses the work requires: ${ph("license names and numbers")}.` : "Subcontractor holds any license the work requires.",
              "Subcontractor is bound by the parts of the prime contract that apply to its work (quality, schedule, safety, insurance, records, inspections).",
              "No further subcontracting without Contractor's written consent.",
            ] },
            H2("Changes, warranty and ending the deal"),
            { t: "bullets", items: [
              "No extra or changed work is paid unless approved in writing before it starts.",
              "The subcontractor warrants its work as the prime contract requires and corrects defects promptly at its cost.",
              `${company} may end the subcontract if the prime contract ends, or if the subcontractor fails to perform after written notice and a fair chance to correct it. Work done and accepted to that point is paid.`,
              `Governing law: ${opp.location.state ? `State of ${opp.location.state}` : ph("State")}.`,
            ] },
            { t: "note", text: "This term sheet summarizes the deal for discussion. It is not a signed contract. Have a lawyer review the full subcontract agreement before anyone signs it." },
            { t: "sig", lines: ["For Contractor:   ______________________________   Date: __________", `                  ${signer}, ${signerTitle}`, "", "For Subcontractor: ______________________________   Date: __________", `                  ${subName}`] },
          ],
        }
      : null;

  return { documents: [...agencyDocs, summary, checklist, ...(term ? [term] : [])], placeholders, digest: digestOf(agencyDocs) };
}

export const daysFromDue = (today: string, due: string | null): number | null => (isIsoDate(due) ? daysBetween(today, due) : null);
