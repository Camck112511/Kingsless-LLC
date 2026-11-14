/**
 * "Who should we sell this contract to?" Ranks every candidate subcontractor from every source on one scale, with the
 * reasons and the concerns in plain words. Directory companies the owner has evidence on outrank AI-found leads, which
 * outrank bare names from federal subaward records. Nothing here is a verification: leads stay leads.
 *
 * PROTECTED engine file.
 */
import { hasWord } from "./fit";
import type { Candidate, Opportunity, RankedSub, Subcontractor } from "./types";
import { clamp } from "./util";

export interface WebLead {
  name: string;
  services: string[];
  city: string;
  state: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  licenses: string[];
  similarWork: string | null;
  sourceUrl: string;
}

export interface FederalLead {
  name: string;
  count: number;
  totalUsd: number;
  latest: string | null;
  states: string[];
  uei: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const stateOf = (opp: Opportunity): string => opp.location.state.trim().toUpperCase().slice(0, 2);

function directory(opp: Opportunity, cands: Candidate[], subs: Subcontractor[]): RankedSub[] {
  return cands.flatMap((c) => {
    const sub = subs.find((s) => s.id === c.subcontractorId);
    if (!sub || sub.willingToSubcontract === "no") return [];
    const reasons = c.checks.filter((k) => k.ok === true && ["service", "geography", "experience", "license", "insurance", "capacity", "willing", "quote"].includes(k.id)).map((k) => k.label);
    const bonus = c.label === "verified" ? 12 : c.label === "partially-verified" ? 6 : 0;
    return [
      {
        name: sub.name,
        source: "directory" as const,
        score: clamp(Math.round(c.fitScore * 0.88 + bonus + (c.quote ? 5 : 0)), 0, 100),
        label: c.label,
        reasons: reasons.length ? reasons : ["On your directory and matches the service"],
        concerns: c.gaps.slice(0, 4),
        contact: sub.contact,
        website: null,
        sourceUrl: null,
        subcontractorId: sub.id,
      },
    ];
  });
}

function web(opp: Opportunity, leads: WebLead[]): RankedSub[] {
  const text = `${opp.title} ${opp.scope}`;
  const st = stateOf(opp);
  const needsLicense = opp.terms.licensingRequired === "yes";
  return leads.map((l) => {
    let score = 38;
    const reasons: string[] = [];
    const concerns: string[] = ["Not verified: confirm license, insurance, capacity and that they will subcontract under your terms."];
    if (l.services.some((s) => hasWord(text, s))) {
      score += 14;
      reasons.push("Offers services named in the scope");
    }
    if (st && l.state.trim().toUpperCase().slice(0, 2) === st) {
      score += 14;
      reasons.push(`Based in ${st}`);
    } else if (st) concerns.push(`Not shown as based in ${st}`);
    if (l.licenses.length > 0) {
      score += needsLicense ? 14 : 6;
      reasons.push(`Page states: ${l.licenses.slice(0, 2).join(", ")}`);
    } else if (needsLicense) concerns.push("A license is required and none is stated");
    if (l.phone || l.email) {
      score += 8;
      reasons.push("Contact details are public");
    } else concerns.push("No contact details found");
    if (l.similarWork) {
      score += 6;
      reasons.push("Shows similar past work");
    }
    return {
      name: l.name,
      source: "web" as const,
      score: clamp(score, 0, 84),
      label: "lead" as const,
      reasons,
      concerns,
      contact: [l.phone && `Phone: ${l.phone}`, l.email && `Email: ${l.email}`].filter(Boolean).join("\n"),
      website: l.website,
      sourceUrl: l.sourceUrl,
      subcontractorId: null,
    };
  });
}

function federal(opp: Opportunity, leads: FederalLead[], today: string): RankedSub[] {
  const st = stateOf(opp);
  const area = (l: FederalLead) => (st ? l.states.includes(st) : false);
  return leads.map((l) => {
    let score = 28 + Math.min(24, l.count * 6);
    const reasons = [`${l.count} federal subaward${l.count === 1 ? "" : "s"} for similar work`];
    const concerns = ["From federal records only: no contact details, nothing verified."];
    if (l.latest && Date.parse(today) - Date.parse(l.latest) < 2 * 365 * 86_400_000) {
      score += 8;
      reasons.push("Worked within the last two years");
    }
    if (area(l)) {
      score += 10;
      reasons.push(`Has worked in ${st}`);
    } else if (st) concerns.push(`No ${st} work in the records`);
    if (l.totalUsd >= 100_000) {
      score += 5;
      reasons.push("Handled sizeable subawards");
    }
    return { name: l.name, source: "federal-records" as const, score: clamp(score, 0, 72), label: "lead" as const, reasons, concerns, contact: l.uei ? `SAM.gov UEI: ${l.uei}` : "", website: null, sourceUrl: null, subcontractorId: null };
  });
}

export interface RankInput {
  opp: Opportunity;
  today: string;
  candidates: Candidate[];
  subs: Subcontractor[];
  webLeads: WebLead[];
  federalLeads: FederalLead[];
}

/** One ranked list, best first. The same company found twice is merged, keeping the stronger entry and both sets of reasons. */
export function rankSubs(input: RankInput): RankedSub[] {
  const all = [...directory(input.opp, input.candidates, input.subs), ...web(input.opp, input.webLeads), ...federal(input.opp, input.federalLeads, input.today)];
  const byName = new Map<string, RankedSub>();
  for (const r of all) {
    const key = norm(r.name);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, r);
      continue;
    }
    const [hi, lo] = prev.score >= r.score ? [prev, r] : [r, prev];
    byName.set(key, {
      ...hi,
      score: clamp(hi.score + 3, 0, 100), // found in more than one place
      reasons: [...new Set([...hi.reasons, ...lo.reasons])],
      concerns: hi.concerns.filter((c) => !/^From federal records only/.test(c) || lo.source !== "directory"),
      contact: hi.contact || lo.contact,
      website: hi.website ?? lo.website,
      sourceUrl: hi.sourceUrl ?? lo.sourceUrl,
      subcontractorId: hi.subcontractorId ?? lo.subcontractorId,
    });
  }
  return [...byName.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
