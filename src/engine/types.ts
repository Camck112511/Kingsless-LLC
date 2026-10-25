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

export type SourceId = "sam.gov" | "fort-worth-bonfire" | "lamp-texas" | "texas-esbd" | "manual";

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

export interface Settings {
  /** Where you want to work. */
  serviceArea: ServiceArea;
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
  contact: { companyName: string; contactName: string; email: string; phone: string };
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
  candidates: Candidate[];
}
