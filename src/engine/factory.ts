/** Builders that fill every field of an Opportunity / Inputs so callers only state what they know. PROTECTED engine file. */
import { DEFAULT_INPUTS, EMPTY_TERMS } from "./config";
import type { Inputs, Opportunity, Terms } from "./types";

export function newTerms(partial: Partial<Terms> = {}): Terms {
  return { ...EMPTY_TERMS, ...partial, evidence: { ...(partial.evidence ?? {}) }, licensingNotes: [...(partial.licensingNotes ?? [])] };
}

export function newOpportunity(partial: Partial<Opportunity> & Pick<Opportunity, "id" | "title">): Opportunity {
  return {
    source: "manual",
    solicitationNumber: "",
    agency: "",
    scope: "",
    category: "unknown",
    location: { city: "", state: "" },
    postedDate: null,
    dueDate: null,
    durationDays: null,
    valueEstimate: { low: null, high: null },
    sourceUrl: "",
    documents: [],
    provenance: { verified: false, checkedOn: null, note: "" },
    ...partial,
    terms: newTerms(partial.terms),
  };
}

export function newInputs(partial: Partial<Inputs> = {}): Inputs {
  return { ...DEFAULT_INPUTS, ...partial, costs: { ...DEFAULT_INPUTS.costs, ...(partial.costs ?? {}) } };
}
