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
  BidRecord,
  Inputs,
  Opportunity,
  Quote,
  ServiceArea,
  Settings,
  Subcontractor,
  SubTerms,
  Targeting,
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

export const SOURCE_IDS = ["sam.gov", "fort-worth-bonfire", "lamp-texas", "texas-esbd", "web", "feed", "url-import", "manual"] as const;
export const CATEGORY_IDS = [
  "supply",
  "construction-general",
  "construction-specialty",
  "security-guard",
  "facility-services",
  "professional-services",
  "other-services",
  "unknown",
] as const;

export const OpportunitySchema: z.ZodType<Opportunity> = z.object({
  id: z.string().min(1).max(120),
  source: z.enum(SOURCE_IDS),
  solicitationNumber: short,
  title: short,
  agency: short,
  scope: long,
  category: z.enum(CATEGORY_IDS),
  location: z.object({ city: short, state: short }),
  postedDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  durationDays: days.nullable(),
  valueEstimate: z.object({ low: money.nullable(), high: money.nullable() }),
  sourceUrl: z.string().max(2000),
  documents: z.array(z.object({ label: short, url: z.string().max(2000) })).max(100),
  naics: z.string().regex(/^\d{2,6}$/).nullable().optional(),
  level: z.enum(["federal", "state", "local", "other"]).nullable().optional(),
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

export const ServiceAreaSchema: z.ZodType<ServiceArea> = z.object({
  scope: z.enum(["anywhere", "selected"]),
  states: z.array(z.string().regex(/^[A-Za-z]{2}$/).transform((v) => v.toUpperCase())).max(60),
  places: z.array(z.string().trim().min(1).max(100)).max(100),
});

const shortList = z.array(z.string().trim().min(1).max(120)).max(60);

export const TargetingSchema: z.ZodType<Targeting> = z.object({
  naics: z.array(z.string().regex(/^\d{2,6}$/)).max(60),
  keywords: shortList,
  avoidKeywords: shortList,
  categories: z.array(z.enum(CATEGORY_IDS)).max(8),
  minValueUsd: money.nullable(),
  maxValueUsd: money.nullable(),
  maxDaysUntilDue: days.nullable(),
  maxDurationDays: days.nullable(),
  // Not validated as URLs here: the owner types these one keystroke at a time, and a half-typed line must not make the
  // whole settings object invalid. The feed reader checks each address before using it.
  feeds: z.array(z.string().max(2000)).max(20),
});

export const SettingsSchema: z.ZodType<Settings> = z.object({
  serviceArea: ServiceAreaSchema,
  targeting: TargetingSchema,
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
  contact: z.object({
    companyName: short,
    contactName: short,
    email: short,
    phone: short,
    title: short.optional(),
    address: z.string().max(500).optional(),
    website: short.optional(),
    uei: short.optional(),
    cage: short.optional(),
    capability: z.string().max(2000).optional(),
  }),
});

export const BidRecordSchema: z.ZodType<BidRecord> = z.object({
  prep: z.object({
    validityDays: z.number().int().min(1).max(730),
    approach: z.string().max(20_000),
    signerName: short,
    signerTitle: short,
    submissionEmail: short,
    reviewedDigest: z.string().max(40),
  }),
  submission: z
    .object({
      submittedOn: isoDate,
      method: z.enum(["console-email", "portal", "own-email", "mail-or-hand"]),
      confirmation: z.string().max(300),
      priceUsd: money.nullable(),
      note: z.string().max(2000),
    })
    .nullable(),
  outcome: z
    .object({ result: z.enum(["won", "lost", "no-award", "withdrawn"]), decidedOn: isoDate, awardUsd: money.nullable(), note: z.string().max(2000) })
    .nullable(),
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
  serviceArea: ServiceAreaSchema.optional(),
  daysBack: z.number().int().min(1).max(90).default(14),
  keyword: z.string().max(100).optional(),
  ncode: z.string().regex(/^\d{2,6}$/).optional(),
  state: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

/* ------------------------------ scouting ------------------------------ */

export const ScoutWebRequestSchema = z.object({
  settings: SettingsSchema,
  query: z.string().max(500).default(""),
  maxLeads: z.number().int().min(3).max(20).default(12),
  today: isoDate.optional(),
});

export const ScoutFeedsRequestSchema = z.object({
  settings: SettingsSchema,
  /** Defaults to settings.targeting.feeds. */
  urls: z.array(z.string().max(2000)).max(10).optional(),
  today: isoDate.optional(),
});

export const ScoutSamRequestSchema = z.object({
  settings: SettingsSchema,
  keyword: z.string().max(100).optional(),
  ncode: z.string().regex(/^\d{2,6}$/).optional(),
  state: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  daysBack: z.number().int().min(1).max(90).default(21),
  limit: z.number().int().min(1).max(100).default(40),
  today: isoDate.optional(),
});

export const AwardsRequestSchema = z.object({
  mode: z.enum(["awards", "subawards"]),
  keywords: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  naics: z.array(z.string().regex(/^\d{2,6}$/)).max(10).default([]),
  states: z.array(z.string().regex(/^[A-Za-z]{2}$/)).max(10).default([]),
  yearsBack: z.number().int().min(1).max(10).default(3),
  limit: z.number().int().min(1).max(100).default(30),
});

export const ImportUrlRequestSchema = z.object({ url: z.string().trim().min(8).max(2000) });

export const LoginRequestSchema = z.object({ password: z.string().min(1).max(500) });

/** Accept the client's local date only if it is within a day or two of the server's; otherwise use the server's. */
export function resolveToday(clientToday: string | undefined, serverNow: Date = new Date()): string {
  const server = serverNow.toISOString().slice(0, 10);
  if (!clientToday) return server;
  const diff = Math.abs(Date.parse(`${clientToday.slice(0, 10)}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(diff) && diff <= 2 ? clientToday.slice(0, 10) : server;
}

export const ReviewRequestSchema = z.object({
  settings: SettingsSchema,
  subcontractors: z.array(SubcontractorSchema).max(500),
  quotes: z.array(QuoteSchema).max(2000),
  item: z.object({ opportunity: OpportunitySchema, inputs: InputsSchema }),
  /** Extra solicitation text the owner pasted. */
  text: z.string().max(200_000).default(""),
  /** Read the official listing page and give the AI its text. */
  readSourcePage: z.boolean().default(true),
  /** Let the AI search the web (agency history, comparable awards). */
  research: z.boolean().default(false),
  today: isoDate.optional(),
});

/* --------------------------------- bids --------------------------------- */

const BidItemSchema = z.object({ opportunity: OpportunitySchema, inputs: InputsSchema, bid: BidRecordSchema.optional() });

export const BidPlanRequestSchema = z.object({
  settings: SettingsSchema,
  subcontractors: z.array(SubcontractorSchema).max(500),
  quotes: z.array(QuoteSchema).max(2000),
  item: BidItemSchema,
  /** Address the bid would be emailed to; only used to evaluate the final check. */
  recipient: z.string().max(320).default(""),
  today: isoDate.optional(),
});

export const BidDownloadRequestSchema = BidPlanRequestSchema.extend({
  format: z.enum(["docx", "pdf", "zip"]),
  doc: z.string().max(60).optional(),
});

export const BidSendRequestSchema = BidPlanRequestSchema.extend({
  to: z.string().trim().min(3).max(320),
  subject: z.string().trim().min(3).max(300),
  message: z.string().trim().min(10).max(10_000),
  /** The owner must type SEND. A click is not enough for an action that reaches an outside party. */
  confirm: z.literal("SEND"),
  /** Extra files such as a certificate of insurance. About 3 MB in total (a serverless request limit). */
  attachments: z.array(z.object({ filename: z.string().min(1).max(120), contentBase64: z.string().max(4_200_000) })).max(4).default([]),
});

export const SubResearchRequestSchema = z.object({
  opportunity: OpportunitySchema,
  settings: SettingsSchema,
  count: z.number().int().min(3).max(12).default(8),
  extra: z.string().max(400).default(""),
});
