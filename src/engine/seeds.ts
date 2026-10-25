/**
 * The three live solicitations the engine is taught with. They were reported by the owner from public listings on
 * 2026-10-25; the engine could not reach the official portals to confirm them, so `provenance.verified` is false.
 * Confirm each against the official portal before relying on it.
 *
 * PROTECTED engine file.
 */
import { newInputs, newOpportunity, newTerms } from "./factory";
import type { Inputs, Opportunity } from "./types";

const REPORTED = "2026-10-25";

export const TEST_CASE_OPPORTUNITIES: Opportunity[] = [
  newOpportunity({
    id: "fw-26-0268",
    source: "fort-worth-bonfire",
    solicitationNumber: "26-0268",
    title: "Seasonal and Event Supplies",
    agency: "City of Fort Worth",
    scope: "Provide decorations, toys, craft supplies, and event items on an as-needed basis.",
    category: "supply",
    location: { city: "Fort Worth", state: "TX" },
    dueDate: "2026-10-29",
    sourceUrl: "https://fortworthtexas.bonfirehub.com/portal/?tab=openOpportunities",
    terms: newTerms({
      subcontracting: "prohibited",
      insuranceRequired: "yes",
      pastPerformance: "scored",
      rapidTurnaround: "yes",
      evidence: {
        subcontracting: ["Listing (as reported): intermediaries are not permitted."],
        insuranceRequired: ["Listing (as reported): requires substantial insurance."],
        pastPerformance: ["Listing (as reported): past performance is scored."],
        rapidTurnaround: ["Listing (as reported): calls for quick quotes and rapid shipping."],
      },
    }),
    provenance: {
      verified: false,
      checkedOn: REPORTED,
      note:
        "Reported by the owner from the public listing. Unconfirmed: an aggregator page mentions a mandatory pre-submittal meeting on 2026-10-22 and a five-year experience requirement. Check the official Bonfire listing.",
    },
  }),
  newOpportunity({
    id: "lamp-rfp-0003",
    source: "lamp-texas",
    solicitationNumber: "RFP-0003",
    title: "Site Clearing and Mass Grading",
    agency: "LAMP Texas",
    scope: "Construction-related site preparation at a major industrial development in Liberty County, Texas: site clearing and mass grading.",
    category: "construction-general",
    location: { city: "Liberty County", state: "TX" },
    dueDate: "2026-11-06",
    sourceUrl: "https://lamptx.com/vendors/",
    provenance: {
      verified: false,
      checkedOn: REPORTED,
      note: "Reported by the owner. The public listing does not state project size, bonds, insurance, subcontracting rules, or payment schedule. Could not be confirmed by search.",
    },
  }),
  newOpportunity({
    id: "lamp-rfp-0005",
    source: "lamp-texas",
    solicitationNumber: "RFP-0005",
    title: "Construction-Phase Site Security",
    agency: "LAMP Texas",
    scope: "Security services for an active construction site in Liberty County, Texas. Recurring service; may lead to multiple shifts or ongoing work.",
    category: "security-guard",
    location: { city: "Liberty County", state: "TX" },
    dueDate: "2026-12-31",
    sourceUrl: "https://lamptx.com/vendors/",
    provenance: {
      verified: false,
      checkedOn: REPORTED,
      note: "Reported by the owner as listed through 2026-12-31; that may be the listing close, not the proposal deadline. Must verify guard licensing, insurance, staffing, duration, and whether the work can be subcontracted.",
    },
  }),
];

export const TEST_CASE_INPUTS: Record<string, Inputs> = Object.fromEntries(
  TEST_CASE_OPPORTUNITIES.map((o) => [o.id, newInputs()]),
);
