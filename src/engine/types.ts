/**
 * Data model for the Contract Arbitrage Engine.
 *
 * CONVENTIONS (read before changing anything):
 *  - Every rate is a FRACTION between 0 and 1 (0.38 means 38%). Field names end in `Rate`.
 *  - Money is whole US dollars as a JS number. Outputs are rounded to cents at the edge.
 *  - Dates are ISO strings ("2026-11-06"). The engine never reads the clock; callers pass `today`.
 *  - "unknown" is a first-class value. The engine never guesses a fact it was not given evidence for.
 *
 * This file is part of the PROTECTED engine (see AGENTS.project.md).
 */

export type Tri = "yes" | "no" | "unknown";
export type GateStatus = "pass" | "fail" | "unknown";

export type SourceId =
  | "sam.gov"
  | "fort-worth-bonfire"
  | "lamp-texas"
  | "texas-esbd"
  | "web" // found by the AI web scout
  | "feed" // an RSS / Atom bid feed you subscribed to
  | "url-import" // a listing page you pointed the console at
  | "manual";

/** Who is buying. Federal awards need a SAM.gov registration; the rest follow their own portals' rules. */
export type BuyerLevel = "federal" | "state" | "local" | "other";

export type SetAside =
  | "none"
  | "small-business"
  | "8a"
  | "sdvosb"
  | "wosb"
  | "hubzone"
  | "unknown";

export type ServiceCategory =
  | "supply"
  | "construction-general"
  | "construction-specialty"
  | "security-guard"
  | "facility-services"
  | "professional-services"
  | "other-services"
  | "unknown";

export type PaymentKind =
  | "net-after-invoice" // one invoice at completion, paid net N
  | "progress" // recurring invoices (monthly by default), each paid net N
  | "milestone" // a few milestone invoices across the performance period
  | "after-acceptance" // paid only after the customer formally accepts the work
  | "unknown";

export type Subcontracting = "allowed" | "prohibited" | "limited" | "unknown";

/** Every fact the engine reads off a solicitation. `evidence` holds the quoted sentences that justify non-unknown values. */
export interface Terms {
  subcontracting: Subcontracting;
  /** Max share of the price that may be paid to subs that are NOT "similarly situated" (fraction). null = no stated cap. */
  subcontractShareCap: number | null;
  setAside: SetAside;

  paymentKind: PaymentKind;
  paymentNetDays: number | null; // days from invoice (or acceptance) to payment
  invoiceCycleDays: number | null; // for `progress`; default 30
  retainageRate: number | null; // fraction withheld until completion
  acceptanceDays: number | null; // review period before acceptance

  bidBond: Tri;
  performanceBond: Tri;
  paymentBond: Tri;
  insuranceRequired: Tri;
  insuranceMinLimitUsd: number | null;

  pastPerformance: "required" | "scored" | "none" | "unknown";
  minYearsExperience: number | null;
  licensingRequired: Tri;
  licensingNotes: string[];

  mandatoryPreBid: Tri;
  preBidDate: string | null;
  rapidTurnaround: Tri; // "quick quotes", "rapid shipping" and the like

  /** field name -> quoted sentences (or "user"/"rule" notes) supporting it */
  evidence: Partial<Record<TermKey, string[]>>;
}

export type TermKey = Exclude<keyof Terms, "evidence">;

export interface DocLink {
  label: string;
  url: string;
}

export interface Opportunity {
  id: string;
  source: SourceId;
  solicitationNumber: string;
  title: string;
  agency: string;
  scope: string;
  category: ServiceCategory;
  location: { city: string; state: string };
  postedDate: string | null;
  dueDate: string | null;
  /** Expected performance length once started; null if the listing does not say. */
  durationDays: number | null;
  /** Government estimate / stated ceiling, if any. null = not stated. */
  valueEstimate: { low: number | null; high: number | null };
  sourceUrl: string;
  documents: DocLink[];
  /** NAICS code (2 to 6 digits) when the listing states one. */
  naics?: string | null;
  /** Federal / state / local buyer when known. SAM.gov listings are always federal. */
  level?: BuyerLevel | null;
  terms: Terms;
  provenance: {
    /** true only if someone confirmed the facts against the official portal. */
    verified: boolean;
    checkedOn: string | null;
    note: string;
  };
}

/* ------------------------------ Settings ------------------------------ */

export interface CompanyProfile {
  /** Capabilities of the prime (you). Requirements are checked against these. */
  samRegistered: boolean; // active SAM.gov registration (needed for federal awards)
  smallBusiness: boolean;
  certifications: Array<"8a" | "sdvosb" | "wosb" | "hubzone">;
  licenses: string[]; // free text, e.g. "Texas DPS Private Security license"
  insuranceCoverageUsd: number; // best general-liability limit you hold today (0 = none)
  bondingCapacityUsd: number; // 0 = none
  yearsInBusiness: number;
  pastPerformanceCount: number; // completed projects you can cite as references
}

/** Where you are willing to work. Contracts are judged (and discovered) against this. */
export interface ServiceArea {
  /** "anywhere" = no location filter. "selected" = only work performed inside the chosen states / places. */
  scope: "anywhere" | "selected";
  /** Two-letter state codes, e.g. ["TX"]. Empty with scope "selected" means no restriction. */
  states: string[];
  /** Optional cities or counties inside those states, e.g. ["Houston", "Liberty County"]. */
  places: string[];
}

/** Result of testing one place of performance against a ServiceArea. */
export interface LocationMatch {
  status: GateStatus;
  detail: string;
  question: string | null;
}

/**
 * What kind of work is worth your time. Contracts are scored against this ("fit") and the best matches are
 * recommended first. Nothing here ever overrides a gate: a perfect fit that fails a hard rule is still rejected.
 */
export interface Targeting {
  /** NAICS codes or prefixes you want, e.g. "238910" or "5617". */
  naics: string[];
  /** Words that describe work you want, e.g. "grading", "janitorial". */
  keywords: string[];
  /** Words that describe work you never want; a match makes the listing "not recommended". */
  avoidKeywords: string[];
  /** Service categories you want. Empty = any. */
  categories: ServiceCategory[];
  minValueUsd: number | null;
  maxValueUsd: number | null;
  /** Prefer listings due within this many days (null = no preference). */
  maxDaysUntilDue: number | null;
  /** Longest performance period you will take on (null = no limit). */
  maxDurationDays: number | null;
  /** RSS / Atom bid-notice feeds the Scout should read. */
  feeds: string[];
}

export interface Settings {
  /** Where you want to work. */
  serviceArea: ServiceArea;
  /** The kinds of contracts you want. */
  targeting: Targeting;
  /** Cash you can actually put at risk. Hard ceiling for the financing gate. */
  availableCapitalUsd: number;
  /** Net margin (before tax) at or above which a bid clears. Also sets the walk-away price. */
  walkAwayMargin: number;
  /** Net margin you are aiming for. Sets the target bid. */
  targetMargin: number;
  /** Absolute profit floor, in dollars; a 20% margin on a $400 job is not worth the time. */
  minProfitUsd: number;
  maxDaysToFirstPayment: number;
  maxDaysToFullPayment: number;
  /** Minimum days between today and the due date, to get real quotes and write a bid. */
  minDaysToDeadline: number;
  /** Cost cushion for overruns, as a fraction of the subcontractor price. */
  contingencyRate: number;
  /** Out-of-pocket dollars to prepare and submit one bid (lost if you lose). */
  bidPrepCostUsd: number;
  profile: CompanyProfile;
  contact: Contact;
}

/** Who signs and who is called. The optional fields fill the bid documents; blanks become visible "to complete" markers. */
export interface Contact {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  /** Signer's title, e.g. "Owner". */
  title?: string;
  /** Mailing address as it should appear on bid documents. */
  address?: string;
  website?: string;
  /** SAM.gov Unique Entity ID and CAGE code, when registered. */
  uei?: string;
  cage?: string;
  /** A short paragraph about what the company does, used in the qualifications document. */
  capability?: string;
}

/* ----------------------------- Economics ------------------------------ */

export type SubTermsKind = "pay-when-paid" | "deposit-balance" | "net" | "on-completion";

export interface SubTerms {
  kind: SubTermsKind;
  /** Fraction of the sub price due at mobilization (deposit-balance only). */
  depositRate: number;
  /** Days after the sub's invoice / completion until you must pay them. */
  netDays: number;
}

export interface CostItems {
  bondPremiumUsd: number;
  insurancePremiumUsd: number;
  registrationUsd: number;
  adminUsd: number;
  financingUsd: number;
  otherUsd: number;
}

/** Admin-entered economics for one opportunity. Everything optional: blank = unknown. */
export interface Inputs {
  /** What you expect the customer to pay (government estimate, comparable awards, or your planned bid). */
  marketPriceUsd: number | null;
  /** Price you actually intend to submit. If null the engine recommends one. */
  plannedBidUsd: number | null;
  /** Your pre-quote estimate of the subcontractor price. Ignored once a firm quote exists. */
  subPriceEstimateUsd: number | null;
  /** Known sub payment terms (usually from a quote). null = unknown. */
  subTerms: SubTerms | null;
  costs: CostItems;
  startLeadDays: number; // award -> mobilization
  /** Overrides Opportunity.durationDays when you know better. */
  durationDays: number | null;
}

export type VerificationLabel = "verified" | "partially-verified" | "unverified";

export interface Quote {
  id: string;
  opportunityId: string;
  subcontractorId: string;
  amountUsd: number;
  receivedOn: string;
  validUntil: string | null;
  /** A firm, written quote for THIS scope (not a ballpark or directory price). */
  firm: boolean;
  scopeMatched: boolean;
  includes: { labor: boolean; materials: boolean; equipment: boolean; mobilization: boolean; insurance: boolean };
  exclusions: string;
  terms: SubTerms;
}

export interface Subcontractor {
  id: string;
  name: string;
  contact: string;
  services: string[]; // lowercase keywords e.g. "grading", "clearing", "security"
  coverage: string[]; // states or cities served, e.g. "TX", "Houston"
  licenses: Array<{ name: string; verifiedOn: string | null }>;
  insuranceCoverageUsd: number | null;
  insuranceCertOnFile: boolean;
  bondingCapacityUsd: number | null;
  certifications: string[];
  similarProjects: Array<{ description: string; year: number | null; referenceVerified: boolean }>;
  capacityConfirmed: boolean; // they confirmed they can hit the dates for this kind of job
  willingToSubcontract: Tri; // under YOUR proposed subcontract agreement
  notes: string;
}

/* ------------------------------- Output ------------------------------- */

export interface Gate {
  id: GateId;
  label: string;
  /** The three gates the owner declared non-negotiable. */
  hard: boolean;
  status: GateStatus;
  summary: string;
  details: string[];
  evidence: string[];
  questions: string[];
  /** For failures that a cheap action would clear (register, buy insurance...). */
  fixableBy: string | null;
}

export type FitFactorId = "service" | "credentials" | "size" | "timeframe" | "location";
export type FitOutcome = "match" | "partial" | "unknown" | "miss";

export interface FitFactor {
  id: FitFactorId;
  label: string;
  /** Points available / earned (out of the factor's weight). */
  max: number;
  earned: number;
  outcome: FitOutcome;
  detail: string;
}

/** How well a listing matches YOUR business (services, licences, size, timing, place). Advisory: never changes a gate. */
export interface Fit {
  /** 0-100. */
  score: number;
  /** False until at least one target (services / size / place) is set in Settings. */
  configured: boolean;
  /** The listing matches a word on your avoid list. */
  excluded: boolean;
  factors: FitFactor[];
  summary: string;
}

export type RecommendationTier = "top-pick" | "recommended" | "consider" | "research-first" | "not-recommended";

export interface Recommendation {
  tier: RecommendationTier;
  headline: string;
  /** Why it was placed in this tier. */
  reasons: string[];
}

export type GateId =
  | "subcontracting"
  | "prime-eligibility"
  | "financing"
  | "location"
  | "margin"
  | "payment-timing"
  | "deadline";

export type Verdict = "reject" | "investigate" | "qualified" | "bid-ready";

export interface CashEvent {
  day: number; // days after award
  label: string;
  amountUsd: number; // + in, - out
  balanceUsd: number; // running balance after this event
}

export interface CashResult {
  peakCashRequiredUsd: number;
  daysToFirstPayment: number;
  daysToFullPayment: number;
  lowestBalanceDay: number;
  events: CashEvent[];
}

export interface PricingResult {
  contractValueUsd: number;
  subPriceUsd: number;
  otherCostsUsd: number;
  grossSpreadUsd: number;
  profitBeforeTaxUsd: number;
  grossMarginRate: number; // gross spread / contract value
  netMarginRate: number; // profit before tax / contract value
  subShareRate: number; // sub price / contract value
  markupOnCostRate: number; // profit / (sub + other costs)
}

export interface Prices {
  /** Price to submit: meets the target margin when the market allows, never below walk-away. */
  targetBidUsd: number | null;
  /** Most you can pay the sub at the working bid without breaking margin, cash, or subcontracting-cap limits. */
  maxSubPriceUsd: number | null;
  /** Lowest bid worth submitting at the current sub price. */
  walkAwayPriceUsd: number | null;
  notes: string[];
}

export interface ScenarioResult {
  name: "optimistic" | "base" | "conservative";
  subPriceUsd: number | null;
  pricing: PricingResult | null;
  cash: CashResult | null;
}

export interface WinFactor {
  label: string;
  multiplier: number;
  reason: string;
}

export interface WinProbability {
  value: number; // fraction
  base: number;
  factors: WinFactor[];
  note: string;
}

export interface Candidate {
  subcontractorId: string;
  name: string;
  label: VerificationLabel;
  fitScore: number; // 0-100, how well they match this job
  checks: Array<{ id: string; label: string; ok: boolean | null; detail: string }>;
  gaps: string[];
  quote: Quote | null;
}

export interface Analysis {
  opportunityId: string;
  asOf: string;
  engineVersion: string;
  verdict: Verdict;
  verdictReason: string;
  gates: Gate[];
  openQuestions: string[];
  warnings: string[];
  nextActions: string[];
  subPriceBasis: "firm-quote" | "estimate" | "none";
  marketPriceUsd: number | null;
  prices: Prices;
  scenarios: ScenarioResult[];
  /** Base-scenario economics; null when value or sub price is unknown. */
  pricing: PricingResult | null;
  cash: CashResult | null;
  winProbability: WinProbability;
  expectedProfitUsd: number | null;
  daysToDeadline: number | null;
  rank: { tier: number; score: number | null };
  fit: Fit;
  recommendation: Recommendation;
  candidates: Candidate[];
}

/* --------------------------------- Bids --------------------------------- */

export type SubmissionMethod = "console-email" | "portal" | "own-email" | "mail-or-hand";

/** What the owner decided and typed while preparing one bid. The bid PRICE lives in Inputs.plannedBidUsd. */
export interface BidPrep {
  /** Days the offer stays open after the due date. */
  validityDays: number;
  /** Owner-written technical approach. Blank = use the generated draft. */
  approach: string;
  signerName: string;
  signerTitle: string;
  /** Where the solicitation says to email bids, if it does. */
  submissionEmail: string;
  /**
   * The owner confirmed they read the documents. Holds the fingerprint of the documents at that moment, so any later change
   * (price, wording, company details) makes the confirmation void until they read again. "" = not reviewed.
   */
  reviewedDigest: string;
}

export interface Submission {
  submittedOn: string;
  method: SubmissionMethod;
  /** Portal confirmation number, email id, tracking number... */
  confirmation: string;
  priceUsd: number | null;
  note: string;
}

export interface BidOutcome {
  result: "won" | "lost" | "no-award" | "withdrawn";
  decidedOn: string;
  awardUsd: number | null;
  note: string;
}

export interface BidRecord {
  prep: BidPrep;
  submission: Submission | null;
  outcome: BidOutcome | null;
}

export type StepStatus = "done" | "todo" | "blocked" | "locked";

export interface WorkflowStep {
  id: "fit" | "prove" | "quotes" | "price" | "docs" | "check" | "submit" | "result" | "win";
  title: string;
  /** One or two plain sentences: why this step exists. */
  why: string;
  status: StepStatus;
  /** What is done, or what is missing, right now. */
  lines: string[];
}

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  /** A failed blocking check stops the console from sending the bid. */
  blocking: boolean;
  detail: string;
}

/** A document in the bid package, as structured content. The server renders it to Word and PDF. */
export type DocBlock =
  | { t: "h"; text: string; level: 1 | 2 | 3 }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][]; widths?: number[] }
  | { t: "kv"; rows: Array<[string, string]> }
  | { t: "sig"; lines: string[] }
  | { t: "note"; text: string };

export interface BidDocument {
  id: string;
  filename: string;
  title: string;
  /** "agency" documents go to the buyer. "internal" ones never leave the company. */
  audience: "agency" | "internal" | "subcontractor";
  /** One short sentence for the owner: what this document is and why it is in the package. */
  purpose: string;
  blocks: DocBlock[];
}

export interface BidPackage {
  documents: BidDocument[];
  /** Fingerprint of the documents that go to the agency. Changes whenever any of their words change. */
  digest: string;
  /** Things the owner still has to fill in, found in the agency documents. */
  placeholders: string[];
}
