/**
 * Engine constants and defaults. Every number that changes a verdict lives here, so the rules are
 * reviewable in one place (and shown read-only on /admin/rules).
 *
 * PROTECTED engine file (see AGENTS.project.md).
 */
import type {
  CompanyProfile,
  CostItems,
  Inputs,
  ServiceCategory,
  Settings,
  SubTerms,
  Terms,
} from "./types";

export const ENGINE_VERSION = "1.0.0";

export const DEFAULT_PROFILE: CompanyProfile = {
  samRegistered: false,
  smallBusiness: true,
  certifications: [],
  licenses: [],
  insuranceCoverageUsd: 0,
  bondingCapacityUsd: 0,
  yearsInBusiness: 0,
  pastPerformanceCount: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  availableCapitalUsd: 300,
  walkAwayMargin: 0.1,
  targetMargin: 0.2,
  minProfitUsd: 250,
  maxDaysToFirstPayment: 90,
  maxDaysToFullPayment: 150,
  minDaysToDeadline: 7,
  contingencyRate: 0.05,
  bidPrepCostUsd: 0,
  profile: DEFAULT_PROFILE,
  contact: { companyName: "Kingsless LLC", contactName: "", email: "", phone: "" },
};

export const ZERO_COSTS: CostItems = {
  bondPremiumUsd: 0,
  insurancePremiumUsd: 0,
  registrationUsd: 0,
  adminUsd: 0,
  financingUsd: 0,
  otherUsd: 0,
};

export const DEFAULT_INPUTS: Inputs = {
  marketPriceUsd: null,
  plannedBidUsd: null,
  subPriceEstimateUsd: null,
  subTerms: null,
  costs: ZERO_COSTS,
  startLeadDays: 14,
  durationDays: null,
};

export const EMPTY_TERMS: Terms = {
  subcontracting: "unknown",
  subcontractShareCap: null,
  setAside: "unknown",
  paymentKind: "unknown",
  paymentNetDays: null,
  invoiceCycleDays: null,
  retainageRate: null,
  acceptanceDays: null,
  bidBond: "unknown",
  performanceBond: "unknown",
  paymentBond: "unknown",
  insuranceRequired: "unknown",
  insuranceMinLimitUsd: null,
  pastPerformance: "unknown",
  minYearsExperience: null,
  licensingRequired: "unknown",
  licensingNotes: [],
  mandatoryPreBid: "unknown",
  preBidDate: null,
  rapidTurnaround: "unknown",
  evidence: {},
};

/** Which verdict tier sorts first. */
export const VERDICT_TIER = { "bid-ready": 0, qualified: 1, investigate: 2, reject: 3 } as const;

export const RULES = {
  /**
   * Until a firm quote exists the sub price is a guess, so economics are evaluated as a range.
   * low = optimistic, high = conservative, both relative to the admin's estimate.
   */
  estimateBand: { lowRate: 0.15, highRate: 0.25 },

  /** Sub payment terms assumed when none are known. */
  subTermsAssumed: {
    optimistic: { kind: "pay-when-paid", depositRate: 0, netDays: 0 } satisfies SubTerms,
    base: { kind: "net", depositRate: 0, netDays: 30 } satisfies SubTerms,
    conservative: { kind: "deposit-balance", depositRate: 0.3, netDays: 0 } satisfies SubTerms,
  },

  /** Customer payment assumed when the clause is unknown (only used to size cash; the timing gate stays "unknown"). */
  customerTermsAssumed: {
    optimistic: { paymentKind: "net-after-invoice", paymentNetDays: 30, acceptanceDays: 0 },
    base: { paymentKind: "net-after-invoice", paymentNetDays: 45, acceptanceDays: 7 },
    conservative: { paymentKind: "after-acceptance", paymentNetDays: 45, acceptanceDays: 14 },
  } as const,

  /** Performance length assumed when neither the listing nor the admin gives one. */
  durationDaysAssumed: { optimistic: 30, base: 60, conservative: 120 },

  defaultInvoiceCycleDays: 30,
  milestoneCount: 3,
  retainageReleaseDays: 30,

  /**
   * Federal limitations on subcontracting (13 CFR 125.6) apply to small-business set-asides: the prime may not pay more than
   * this fraction of the amount it is paid to subs that are not "similarly situated" (same small-business status).
   * Only used when the solicitation does not state its own cap. ALWAYS confirm against the solicitation clause.
   */
  setAsideSubcontractCap: {
    supply: 0.5,
    "construction-general": 0.85,
    "construction-specialty": 0.75,
    "security-guard": 0.5,
    "facility-services": 0.5,
    "professional-services": 0.5,
    "other-services": 0.5,
    unknown: 0.5,
  } satisfies Record<ServiceCategory, number>,

  /** Categories where the company delivering the service is commonly required to hold a license. */
  licenseRisk: {
    "security-guard":
      "Guard services are state-licensed in Texas (Occupations Code Ch. 1702, DPS Private Security Program). Confirm whether a prime that only subcontracts the guards must itself be licensed.",
    "construction-specialty":
      "Some specialty trades (electrical, plumbing, HVAC) require a state license. Confirm which trades this scope includes and who must hold the license.",
  } satisfies Partial<Record<ServiceCategory, string>>,

  /**
   * Win probability is a TRANSPARENT HEURISTIC, not a forecast. Every factor is shown in the UI.
   * Calibrate these from your own bid history once you have outcomes.
   */
  winProbability: {
    base: 0.15,
    floor: 0.01,
    ceiling: 0.6,
    pastPerformanceScoredNone: 0.4,
    pastPerformanceScoredSome: 0.8,
    priceUnderMarket: 1.3,
    priceAtMarket: 1.0,
    priceSlightlyOver: 0.6,
    priceFarOver: 0.3,
    priceUnknown: 0.85,
    noFirmQuote: 0.9,
    restrictedPool: 1.3,
    rapidTurnaround: 0.7,
    shortFuse: 0.85,
    shortFuseDays: 10,
  },

  /** Ranking: score = expectedProfit / (1 + daysToFirstPayment / H) / (1 + peakCash / capital). */
  ranking: { paymentHorizonDays: 90 },

  /** A quote older than this (days) is treated as expired when it has no explicit validity date. */
  quoteDefaultValidDays: 30,
} as const;
