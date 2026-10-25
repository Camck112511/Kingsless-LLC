/**
 * Safety net for the optional AI reader.
 *
 * The AI may only PROPOSE facts. A proposed fact is accepted only if
 *   1. the field is one the engine knows and the value parses and is in range, and
 *   2. its supporting quote appears VERBATIM in the source text (so a model cannot invent a clause).
 * Conflicts resolve toward the stricter reading, and are reported so a human decides.
 *
 * PROTECTED engine file.
 */
import type { PaymentKind, SetAside, Subcontracting, TermKey, Terms, Tri } from "./types";
import { applyPatch, type TermsPatch } from "./extract";

export const AI_FIELDS = [
  "subcontracting",
  "subcontractShareCap",
  "setAside",
  "paymentKind",
  "paymentNetDays",
  "invoiceCycleDays",
  "retainageRate",
  "acceptanceDays",
  "bidBond",
  "performanceBond",
  "paymentBond",
  "insuranceRequired",
  "insuranceMinLimitUsd",
  "pastPerformance",
  "minYearsExperience",
  "licensingRequired",
  "mandatoryPreBid",
  "preBidDate",
  "rapidTurnaround",
] as const;

export type AiField = (typeof AI_FIELDS)[number];

export interface AiFact {
  field: string;
  value: string;
  quote: string;
}

export interface AiMergeReport {
  terms: Terms;
  accepted: Array<{ field: string; value: string; quote: string }>;
  rejected: Array<{ field: string; reason: string }>;
  conflicts: string[];
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** True if `quote` occurs in `text` ignoring case, whitespace runs and curly quotes. */
export const quoteAppearsIn = (quote: string, text: string): boolean => {
  const q = norm(quote);
  return q.length >= 12 && norm(text).includes(q);
};

const TRI = new Set(["yes", "no"]);
const rate = (v: string): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const int = (v: string, max: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/** Parse a field's string value; null means invalid/unknown and the fact is rejected. */
function parseValue(field: AiField, raw: string): Terms[TermKey] | null {
  const v = raw.trim().toLowerCase();
  switch (field) {
    case "subcontracting":
      return (["allowed", "prohibited", "limited"] as const).includes(v as Subcontracting & ("allowed" | "prohibited" | "limited"))
        ? (v as Subcontracting)
        : null;
    case "setAside":
      return (["none", "small-business", "8a", "sdvosb", "wosb", "hubzone"] as const).includes(v as SetAside & "none")
        ? (v as SetAside)
        : null;
    case "paymentKind":
      return (["net-after-invoice", "progress", "milestone", "after-acceptance"] as const).includes(v as PaymentKind & "progress")
        ? (v as PaymentKind)
        : null;
    case "pastPerformance":
      return (["required", "scored", "none"] as const).includes(v as "required") ? (v as Terms["pastPerformance"]) : null;
    case "bidBond":
    case "performanceBond":
    case "paymentBond":
    case "insuranceRequired":
    case "licensingRequired":
    case "mandatoryPreBid":
    case "rapidTurnaround":
      return TRI.has(v) ? (v as Tri) : null;
    case "subcontractShareCap":
    case "retainageRate":
      return rate(v);
    case "paymentNetDays":
    case "invoiceCycleDays":
    case "acceptanceDays":
      return int(v, 365);
    case "minYearsExperience":
      return int(v, 100);
    case "insuranceMinLimitUsd": {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
    }
    case "preBidDate":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  }
}

const STRICT_RANK: Partial<Record<AiField, (v: unknown) => number>> = {
  subcontracting: (v) => ({ prohibited: 3, limited: 2, allowed: 1, unknown: 0 })[String(v)] ?? 0,
  bidBond: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  performanceBond: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  paymentBond: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  insuranceRequired: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  licensingRequired: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  mandatoryPreBid: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
  rapidTurnaround: (v) => (v === "yes" ? 2 : v === "no" ? 1 : 0),
};

export function mergeAiFacts(base: Terms, facts: AiFact[], sourceText: string): AiMergeReport {
  const accepted: AiMergeReport["accepted"] = [];
  const rejected: AiMergeReport["rejected"] = [];
  const conflicts: string[] = [];
  const patch: TermsPatch = { evidence: {} };
  const overwrite: TermsPatch = { evidence: {} };

  for (const fact of facts) {
    if (!(AI_FIELDS as readonly string[]).includes(fact.field)) {
      rejected.push({ field: fact.field, reason: "not a field the engine reads" });
      continue;
    }
    const field = fact.field as AiField;
    const value = parseValue(field, fact.value);
    if (value === null) {
      rejected.push({ field, reason: `value "${fact.value}" is not valid for this field` });
      continue;
    }
    if (!quoteAppearsIn(fact.quote, sourceText)) {
      rejected.push({ field, reason: "supporting quote not found verbatim in the document" });
      continue;
    }

    const current = (base as unknown as Record<string, unknown>)[field];
    const blank = current === "unknown" || current === null || current === undefined;
    const evidenceLine = `AI: "${fact.quote.trim()}"`;
    const strict = STRICT_RANK[field];

    if (blank) {
      (patch as Record<string, unknown>)[field] = value;
      patch.evidence![field] = [evidenceLine];
      accepted.push({ field, value: fact.value, quote: fact.quote });
    } else if (current !== value) {
      if (strict && strict(value) > strict(current)) {
        (overwrite as Record<string, unknown>)[field] = value;
        overwrite.evidence![field] = [evidenceLine];
        accepted.push({ field, value: fact.value, quote: fact.quote });
        conflicts.push(`${field}: AI found "${String(value)}" (stricter) where the earlier reading was "${String(current)}". Using the stricter reading; confirm in the document.`);
      } else {
        conflicts.push(`${field}: AI found "${String(value)}" but the existing value is "${String(current)}". Kept the existing value; confirm in the document.`);
      }
    }
  }

  let terms = applyPatch(base, patch);
  terms = applyPatch(terms, overwrite, { overwrite: true });
  return { terms, accepted, rejected, conflicts };
}
