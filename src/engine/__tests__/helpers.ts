import { DEFAULT_SETTINGS } from "../config";
import { newInputs, newOpportunity, newTerms } from "../factory";
import type { Inputs, Opportunity, Quote, Settings, Subcontractor, Terms } from "../types";
import type { World } from "../analyze";

export const TODAY = "2026-10-25";

export const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...over,
  profile: { ...DEFAULT_SETTINGS.profile, ...(over.profile ?? {}) },
});

export const world = (over: Partial<World> = {}): World => ({
  settings: settings(),
  subcontractors: [],
  quotes: [],
  today: TODAY,
  ...over,
});

/** A clean, fully-known, small facility-services job: every gate passes if the economics work. */
export const cleanTerms = (over: Partial<Terms> = {}): Terms =>
  newTerms({
    subcontracting: "allowed",
    setAside: "none",
    paymentKind: "net-after-invoice",
    paymentNetDays: 30,
    bidBond: "no",
    performanceBond: "no",
    paymentBond: "no",
    insuranceRequired: "no",
    pastPerformance: "none",
    licensingRequired: "no",
    mandatoryPreBid: "no",
    rapidTurnaround: "no",
    ...over,
  });

export const cleanOpp = (over: Partial<Opportunity> = {}): Opportunity =>
  newOpportunity({
    id: "demo",
    title: "Janitorial services, county annex",
    solicitationNumber: "D-1",
    agency: "Demo County",
    scope: "Janitorial cleaning services for a county annex building.",
    category: "facility-services",
    location: { city: "Houston", state: "TX" },
    dueDate: "2026-11-20",
    durationDays: 30,
    terms: cleanTerms(),
    ...over,
  });

export const payWhenPaid = { kind: "pay-when-paid" as const, depositRate: 0, netDays: 0 };

export const goodInputs = (over: Partial<Inputs> = {}): Inputs =>
  newInputs({ marketPriceUsd: 4000, subPriceEstimateUsd: 2600, subTerms: payWhenPaid, ...over });

export const sub = (over: Partial<Subcontractor> = {}): Subcontractor => ({
  id: "s1",
  name: "Acme Cleaning",
  contact: "",
  services: ["janitorial"],
  coverage: ["TX"],
  licenses: [],
  insuranceCoverageUsd: null,
  insuranceCertOnFile: false,
  bondingCapacityUsd: null,
  certifications: [],
  similarProjects: [],
  capacityConfirmed: false,
  willingToSubcontract: "unknown",
  notes: "",
  ...over,
});

export const quote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1",
  opportunityId: "demo",
  subcontractorId: "s1",
  amountUsd: 2600,
  receivedOn: "2026-10-24",
  validUntil: null,
  firm: true,
  scopeMatched: true,
  includes: { labor: true, materials: true, equipment: true, mobilization: true, insurance: true },
  exclusions: "",
  terms: payWhenPaid,
  ...over,
});
