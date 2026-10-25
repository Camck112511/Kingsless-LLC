/** Builders the admin forms use to create engine objects. They live here (not in UI files) because they construct engine types. PROTECTED. */
import { newOpportunity, newTerms } from "@/engine";
import type { Opportunity, ServiceCategory, SourceId, Subcontractor, Terms } from "@/engine/types";
import { newId } from "./store";

export interface IntakeForm {
  title: string;
  solicitationNumber: string;
  agency: string;
  source: SourceId;
  sourceUrl: string;
  category: ServiceCategory;
  dueDate: string;
  city: string;
  state: string;
  scope: string;
}

export const blankIntake = (): IntakeForm => ({
  title: "",
  solicitationNumber: "",
  agency: "",
  source: "manual",
  sourceUrl: "",
  category: "unknown",
  dueDate: "",
  city: "",
  state: "",
  scope: "",
});

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export function buildOpportunity(f: IntakeForm, terms?: Terms): Opportunity {
  return newOpportunity({
    id: `${slug(f.solicitationNumber || f.title) || "opp"}-${newId("m").slice(-6)}`,
    source: f.source,
    solicitationNumber: f.solicitationNumber.trim(),
    title: f.title.trim(),
    agency: f.agency.trim(),
    scope: f.scope.trim(),
    category: f.category,
    location: { city: f.city.trim(), state: f.state.trim().toUpperCase() },
    dueDate: f.dueDate || null,
    sourceUrl: f.sourceUrl.trim(),
    terms: terms ?? newTerms(),
    provenance: { verified: false, checkedOn: null, note: "Entered by hand. Confirm against the official solicitation." },
  });
}

export const blankSub = (): Subcontractor => ({
  id: newId("sub"),
  name: "",
  contact: "",
  services: [],
  coverage: [],
  licenses: [],
  insuranceCoverageUsd: null,
  insuranceCertOnFile: false,
  bondingCapacityUsd: null,
  certifications: [],
  similarProjects: [],
  capacityConfirmed: false,
  willingToSubcontract: "unknown",
  notes: "",
});

/** A directory entry for a company found by research. Everything beyond what the source states stays unconfirmed. */
export function subFromResearch(p: { name: string; services: string[]; coverage: string[]; contact?: string; notes: string; similar?: Array<{ description: string; year: number | null }> }): Subcontractor {
  return {
    ...blankSub(),
    name: p.name.trim(),
    contact: p.contact?.trim() ?? "",
    services: p.services.map((s) => s.trim().toLowerCase()).filter(Boolean),
    coverage: p.coverage.map((s) => s.trim()).filter(Boolean),
    similarProjects: (p.similar ?? []).map((x) => ({ description: x.description, year: x.year, referenceVerified: false })),
    notes: p.notes,
  };
}
