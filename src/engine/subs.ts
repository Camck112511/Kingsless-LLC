/**
 * Subcontractor shortlist. A company appearing in a directory is NOT proof it will accept your price or take the work,
 * so every candidate is labelled verified / partially-verified / unverified from evidence, and every gap is listed.
 *
 * PROTECTED engine file.
 */
import { quoteIsUsable } from "./scenarios";
import { usd } from "./util";
import type { Candidate, Opportunity, Quote, ServiceCategory, Subcontractor, VerificationLabel } from "./types";

const CATEGORY_KEYWORDS: Record<ServiceCategory, string[]> = {
  supply: ["supply", "supplies", "distribution", "wholesale"],
  "construction-general": ["construction", "grading", "clearing", "earthwork", "site work", "excavation"],
  "construction-specialty": ["electrical", "plumbing", "hvac", "paving", "concrete", "roofing", "fencing"],
  "security-guard": ["security", "guard", "patrol"],
  "facility-services": ["janitorial", "cleaning", "facility", "maintenance", "landscaping"],
  "professional-services": ["consulting", "engineering", "design", "survey", "inspection"],
  "other-services": [],
  unknown: [],
};

interface Check {
  id: string;
  label: string;
  weight: number;
  ok: boolean | null; // true confirmed, false missing/contradicted, null not applicable
  detail: string;
}

function bestQuote(subId: string, opportunityId: string, quotes: Quote[], today: string): { usable: Quote | null; any: Quote | null } {
  const mine = quotes.filter((q) => q.subcontractorId === subId && q.opportunityId === opportunityId);
  const usable = mine.filter((q) => quoteIsUsable(q, today)).sort((a, b) => a.amountUsd - b.amountUsd)[0] ?? null;
  return { usable, any: mine[0] ?? null };
}

export function evaluateCandidate(
  opp: Opportunity,
  sub: Subcontractor,
  quotes: Quote[],
  maxSubPriceUsd: number | null,
  today: string,
): Candidate {
  const t = opp.terms;
  const text = `${opp.title} ${opp.scope}`.toLowerCase();
  const keywords = [...CATEGORY_KEYWORDS[opp.category]];
  const services = sub.services.map((s) => s.toLowerCase());
  const serviceOk = services.some((s) => text.includes(s) || keywords.some((k) => k.includes(s) || s.includes(k)));
  const { usable, any } = bestQuote(sub.id, opp.id, quotes, today);

  const state = opp.location.state.trim().toLowerCase();
  const city = opp.location.city.trim().toLowerCase();
  const coverage = sub.coverage.map((c) => c.toLowerCase());
  const geoApplicable = state !== "" || city !== "";
  const geoOk = coverage.includes(state) || (city !== "" && coverage.includes(city));

  const needsLicense = t.licensingRequired === "yes";
  const licensesVerified = sub.licenses.filter((l) => l.verifiedOn);
  const needsInsurance = t.insuranceRequired === "yes";
  const insuranceMin = t.insuranceMinLimitUsd ?? 1;
  const needsBond = t.bidBond === "yes" || t.performanceBond === "yes" || t.paymentBond === "yes";

  const checks: Check[] = [
    {
      id: "service", label: "Service match", weight: 25, ok: serviceOk,
      detail: serviceOk ? "Offers services that match this scope." : "No listed service matches this scope.",
    },
    {
      id: "geography", label: "Serves the location", weight: 15, ok: geoApplicable ? geoOk : null,
      detail: geoOk ? "Covers the project location." : `Does not list ${opp.location.city || opp.location.state || "this location"} as covered.`,
    },
    {
      id: "experience", label: "Similar completed projects", weight: 15, ok: sub.similarProjects.length > 0,
      detail: sub.similarProjects.length === 0
        ? "No similar projects on file."
        : `${sub.similarProjects.length} similar project(s); ${sub.similarProjects.filter((p) => p.referenceVerified).length} reference(s) verified.`,
    },
    {
      id: "license", label: "Required license verified", weight: 10, ok: needsLicense ? licensesVerified.length > 0 : null,
      detail: licensesVerified.length > 0 ? `Verified: ${licensesVerified.map((l) => l.name).join(", ")}.` : "No license verified against the issuing authority.",
    },
    {
      id: "insurance", label: "Insurance meets requirement", weight: 10,
      ok: needsInsurance ? (sub.insuranceCoverageUsd ?? 0) >= insuranceMin && sub.insuranceCertOnFile : null,
      detail: sub.insuranceCertOnFile ? `Certificate on file (${usd(sub.insuranceCoverageUsd ?? 0)} limit).` : "No insurance certificate on file.",
    },
    {
      id: "bonding", label: "Bonding capacity", weight: 5, ok: needsBond ? (sub.bondingCapacityUsd ?? 0) > 0 : null,
      detail: (sub.bondingCapacityUsd ?? 0) > 0 ? "Has bonding capacity." : "No bonding capacity on file.",
    },
    {
      id: "capacity", label: "Can meet the schedule", weight: 10, ok: sub.capacityConfirmed,
      detail: sub.capacityConfirmed ? "Confirmed capacity for the dates." : "Capacity not confirmed.",
    },
    {
      id: "quote", label: "Firm quote for this scope", weight: 0, ok: usable !== null,
      detail: usable
        ? `Firm quote of ${usd(usable.amountUsd)} received ${usable.receivedOn}.`
        : any
          ? "Only a non-firm, expired, or mismatched quote on file."
          : "No quote requested or received.",
    },
    {
      id: "willing", label: "Will subcontract under your agreement", weight: 0, ok: sub.willingToSubcontract === "yes",
      detail: sub.willingToSubcontract === "yes" ? "Confirmed willing." : sub.willingToSubcontract === "no" ? "Declined." : "Not confirmed.",
    },
    {
      id: "price", label: "Price within your maximum", weight: 10,
      ok: usable && maxSubPriceUsd !== null ? usable.amountUsd <= maxSubPriceUsd + 1e-9 : null,
      detail: usable && maxSubPriceUsd !== null
        ? usable.amountUsd <= maxSubPriceUsd ? "Quote is at or under your maximum sub price." : "Quote exceeds your maximum sub price."
        : "No quote to compare.",
    },
  ];

  const applicable = checks.filter((c) => c.ok !== null && c.weight > 0);
  const total = applicable.reduce((s, c) => s + c.weight, 0);
  const earned = applicable.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  const fitScore = total > 0 ? Math.round((earned / total) * 100) : 0;

  const ok = (id: string) => checks.find((c) => c.id === id)?.ok;
  const required = ["service", "geography", "experience", "license", "insurance", "bonding", "capacity", "quote", "willing"];
  const verified = required.every((id) => ok(id) !== false);
  const confirmedCount = ["service", "geography", "experience", "license", "insurance", "bonding", "capacity"].filter((id) => ok(id) === true).length;
  const label: VerificationLabel = verified
    ? "verified"
    : ok("quote") || ok("willing") || confirmedCount >= 4
      ? "partially-verified"
      : "unverified";

  const gaps = checks.filter((c) => c.ok === false && c.id !== "price").map((c) => `${c.label}: ${c.detail}`);
  return {
    subcontractorId: sub.id,
    name: sub.name,
    label,
    fitScore,
    checks: checks.map((c) => ({ id: c.id, label: c.label, ok: c.ok, detail: c.detail })),
    gaps,
    quote: usable,
  };
}

const LABEL_RANK: Record<VerificationLabel, number> = { verified: 0, "partially-verified": 1, unverified: 2 };

export function shortlist(
  opp: Opportunity,
  subs: Subcontractor[],
  quotes: Quote[],
  maxSubPriceUsd: number | null,
  today: string,
): Candidate[] {
  return subs
    .map((s) => evaluateCandidate(opp, s, quotes, maxSubPriceUsd, today))
    .filter((c) => c.checks.find((k) => k.id === "service")?.ok || c.quote !== null)
    .sort(
      (a, b) =>
        LABEL_RANK[a.label] - LABEL_RANK[b.label] ||
        b.fitScore - a.fitScore ||
        (a.quote?.amountUsd ?? Infinity) - (b.quote?.amountUsd ?? Infinity),
    );
}
