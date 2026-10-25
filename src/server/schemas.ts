/**
 * Runtime validation for everything the browser sends to the server. The types are pinned to the engine's own
 * types (`z.ZodType<Opportunity>` etc.), so the compiler fails if the two ever drift apart.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { z } from "zod";
import type {
  CompanyProfile,
  CostItems,
  Inputs,
  Opportunity,
  Quote,
  Settings,
  Subcontractor,
  SubTerms,
  Terms,
} from "@/engine/types";

const money = z.number().finite().min(0).max(10_000_000_000);
const rate = z.number().finite().min(0).max(1);
const days = z.number().finite().int().min(0).max(3650);
const short = z.string().max(300);
const long = z.string().max(50_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(40);
const tri = z.enum(["yes", "no", "unknown"]);

export const SubTermsSchema: z.ZodType<SubTerms> = z.object({
  kind: z.enum(["pay-when-paid", "deposit-balance", "net", "on-completion"]),
  depositRate: rate,
  netDays: days,
});

export const TermsSchema: z.ZodType<Terms> = z.object({
  subcontracting: z.enum(["allowed", "prohibited", "limited", "unknown"]),
  subcontractShareCap: rate.nullable(),
  setAside: z.enum(["none", "small-business", "8a", "sdvosb", "wosb", "hubzone", "unknown"]),
  paymentKind: z.enum(["net-after-invoice", "progress", "milestone", "after-acceptance", "unknown"]),
  paymentNetDays: days.nullable(),
  invoiceCycleDays: days.nullable(),
  retainageRate: rate.nullable(),
  acceptanceDays: days.nullable(),
  bidBond: tri,
  performanceBond: tri,
  paymentBond: tri,
  insuranceRequired: tri,
  insuranceMinLimitUsd: money.nullable(),
  pastPerformance: z.enum(["required", "scored", "none", "unknown"]),
  minYearsExperience: z.number().finite().int().min(0).max(100).nullable(),
  licensingRequired: tri,
  licensingNotes: z.array(z.string().max(1000)).max(50),
  mandatoryPreBid: tri,
  preBidDate: isoDate.nullable(),
  rapidTurnaround: tri,
  evidence: z.record(z.string().max(60), z.array(z.string().max(1000)).max(50)),
});

export const OpportunitySchema: z.ZodType<Opportunity> = z.object({
  id: z.string().min(1).max(120),
  source: z.enum(["sam.gov", "fort-worth-bonfire", "lamp-texas", "texas-esbd", "manual"]),
  solicitationNumber: short,
  title: short,
  agency: short,
  scope: long,
  category: z.enum([
    "supply",
    "construction-general",
    "construction-specialty",
    "security-guard",
    "facility-services",
    "professional-services",
    "other-services",
    "unknown",
  ]),
  location: z.object({ city: short, state: short }),
  postedDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  durationDays: days.nullable(),
  valueEstimate: z.object({ low: money.nullable(), high: money.nullable() }),
  sourceUrl: z.string().max(2000),
  documents: z.array(z.object({ label: short, url: z.string().max(2000) })).max(100),
  terms: TermsSchema,
  provenance: z.object({ verified: z.boolean(), checkedOn: isoDate.nullable(), note: z.string().max(5000) }),
});

const CostItemsSchema: z.ZodType<CostItems> = z.object({
  bondPremiumUsd: money,
  insurancePremiumUsd: money,
  registrationUsd: money,
  adminUsd: money,
  financingUsd: money,
  otherUsd: money,
});

export const InputsSchema: z.ZodType<Inputs> = z.object({
  marketPriceUsd: money.nullable(),
  plannedBidUsd: money.nullable(),
  subPriceEstimateUsd: money.nullable(),
  subTerms: SubTermsSchema.nullable(),
  costs: CostItemsSchema,
  startLeadDays: days,
  durationDays: days.nullable(),
});

export const QuoteSchema: z.ZodType<Quote> = z.object({
  id: z.string().min(1).max(120),
  opportunityId: z.string().min(1).max(120),
  subcontractorId: z.string().min(1).max(120),
  amountUsd: money,
  receivedOn: isoDate,
  validUntil: isoDate.nullable(),
  firm: z.boolean(),
  scopeMatched: z.boolean(),
  includes: z.object({ labor: z.boolean(), materials: z.boolean(), equipment: z.boolean(), mobilization: z.boolean(), insurance: z.boolean() }),
  exclusions: z.string().max(5000),
  terms: SubTermsSchema,
});

export const SubcontractorSchema: z.ZodType<Subcontractor> = z.object({
  id: z.string().min(1).max(120),
  name: short,
  contact: z.string().max(1000),
  services: z.array(short).max(50),
  coverage: z.array(short).max(100),
  licenses: z.array(z.object({ name: short, verifiedOn: isoDate.nullable() })).max(50),
  insuranceCoverageUsd: money.nullable(),
  insuranceCertOnFile: z.boolean(),
  bondingCapacityUsd: money.nullable(),
  certifications: z.array(short).max(50),
  similarProjects: z.array(z.object({ description: z.string().max(2000), year: z.number().int().min(1900).max(2100).nullable(), referenceVerified: z.boolean() })).max(100),
  capacityConfirmed: z.boolean(),
  willingToSubcontract: tri,
  notes: z.string().max(5000),
});

const ProfileSchema: z.ZodType<CompanyProfile> = z.object({
  samRegistered: z.boolean(),
  smallBusiness: z.boolean(),
  certifications: z.array(z.enum(["8a", "sdvosb", "wosb", "hubzone"])).max(4),
  licenses: z.array(short).max(50),
  insuranceCoverageUsd: money,
  bondingCapacityUsd: money,
  yearsInBusiness: z.number().finite().min(0).max(200),
  pastPerformanceCount: z.number().finite().int().min(0).max(10_000),
});

export const SettingsSchema: z.ZodType<Settings> = z.object({
  availableCapitalUsd: money,
  walkAwayMargin: z.number().finite().min(0).max(0.95),
  targetMargin: z.number().finite().min(0).max(0.95),
  minProfitUsd: money,
  maxDaysToFirstPayment: days,
  maxDaysToFullPayment: days,
  minDaysToDeadline: days,
  contingencyRate: z.number().finite().min(0).max(2),
  bidPrepCostUsd: money,
  profile: ProfileSchema,
  contact: z.object({ companyName: short, contactName: short, email: short, phone: short }),
});

/* ------------------------------ requests ------------------------------ */

export const AnalyzeRequestSchema = z.object({
  settings: SettingsSchema,
  subcontractors: z.array(SubcontractorSchema).max(500),
  quotes: z.array(QuoteSchema).max(2000),
  items: z.array(z.object({ opportunity: OpportunitySchema, inputs: InputsSchema })).max(300),
  today: isoDate.optional(),
  withScripts: z.boolean().optional(),
});

export const PricingRequestSchema = z.object({
  contractValueUsd: money,
  subPriceUsd: money,
  otherCostsUsd: money,
});

export const ExtractRequestSchema = z.object({
  text: z.string().min(20).max(400_000),
  useAi: z.boolean().default(false),
  baseTerms: TermsSchema.optional(),
});

export const DiscoverRequestSchema = z.object({
  daysBack: z.number().int().min(1).max(90).default(14),
  keyword: z.string().max(100).optional(),
  ncode: z.string().regex(/^\d{2,6}$/).optional(),
  state: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const LoginRequestSchema = z.object({ password: z.string().min(1).max(500) });

/** Accept the client's local date only if it is within a day or two of the server's; otherwise use the server's. */
export function resolveToday(clientToday: string | undefined, serverNow: Date = new Date()): string {
  const server = serverNow.toISOString().slice(0, 10);
  if (!clientToday) return server;
  const diff = Math.abs(Date.parse(`${clientToday.slice(0, 10)}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(diff) && diff <= 2 ? clientToday.slice(0, 10) : server;
}
