/**
 * Turns SAM.gov "Get Opportunities" API records into the engine's Opportunity shape.
 * Pure and defensive: every field may be missing, and nothing the record does not state is invented.
 *
 * NOTE: written from the public API documentation; it has not been run against the live API from this build environment
 * (the sandbox could not reach api.sam.gov). Check the first real response and adjust the field mapping if needed.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { newOpportunity, newTerms } from "@/engine/factory";
import type { Opportunity, ServiceCategory, SetAside } from "@/engine/types";
import type { AwardLead } from "./types";

export interface SamRecord {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  typeOfSetAsideDescription?: string | null;
  typeOfSetAside?: string | null;
  responseDeadLine?: string | null;
  naicsCode?: string | number | null;
  classificationCode?: string | null;
  active?: string;
  uiLink?: string;
  resourceLinks?: string[] | null;
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string; name?: string } } | null;
  award?: { date?: string; number?: string; amount?: string | number; awardee?: { name?: string } } | null;
}

export function setAsideFromCode(code: string | null | undefined): SetAside {
  const c = (code ?? "").toUpperCase();
  if (!c) return "none";
  if (c === "SBA" || c === "SBP") return "small-business";
  if (c.startsWith("8A")) return "8a";
  if (c.startsWith("HZ")) return "hubzone";
  if (c.startsWith("SDVOSB")) return "sdvosb";
  if (c.includes("WOSB")) return "wosb";
  return "unknown"; // an unrecognised code is not "none"
}

export function categoryFrom(naics: string, psc: string): ServiceCategory {
  if (naics.startsWith("561612")) return "security-guard";
  if (naics.startsWith("5617") || naics.startsWith("5612")) return "facility-services";
  if (naics.startsWith("236") || naics.startsWith("237")) return "construction-general";
  if (naics.startsWith("238")) return "construction-specialty";
  if (naics.startsWith("54")) return "professional-services";
  if (/^(31|32|33|42|44|45)/.test(naics)) return "supply";
  if (/^\d{4}$/.test(psc)) return "supply"; // numeric product service codes are supplies
  if (/^[A-Z]/.test(psc)) return "other-services";
  return "unknown";
}

const day = (s: string | null | undefined): string | null => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

export function normalizeSolicitation(r: SamRecord, checkedOn: string): Opportunity | null {
  if (!r.noticeId || !r.title) return null;
  const naics = String(r.naicsCode ?? "");
  const setAside = setAsideFromCode(r.typeOfSetAside);
  const setAsideNote = r.typeOfSetAsideDescription ? `SAM.gov set-aside field: ${r.typeOfSetAsideDescription}` : "SAM.gov lists no set-aside for this notice.";
  return newOpportunity({
    id: `sam-${r.noticeId}`,
    source: "sam.gov",
    solicitationNumber: r.solicitationNumber ?? "",
    title: r.title,
    agency: (r.fullParentPathName ?? "").split(".").slice(0, 2).join(" / "),
    scope: `${r.title}${naics ? ` (NAICS ${naics})` : ""}. Paste the solicitation text on the Add page to extract subcontracting, payment, bond and insurance terms.`,
    category: categoryFrom(naics, r.classificationCode ?? ""),
    location: { city: r.placeOfPerformance?.city?.name ?? "", state: r.placeOfPerformance?.state?.code ?? "" },
    postedDate: day(r.postedDate),
    dueDate: day(r.responseDeadLine),
    sourceUrl: r.uiLink ?? `https://sam.gov/opp/${r.noticeId}/view`,
    documents: (r.resourceLinks ?? []).map((url, i) => ({ label: `Attachment ${i + 1}`, url })),
    terms: newTerms({ setAside, evidence: { setAside: [setAsideNote] } }),
    provenance: { verified: false, checkedOn, note: "Imported from the SAM.gov API. Dates and set-aside come from SAM.gov; every other term is unknown until the documents are read." },
  });
}

export function normalizeAward(r: SamRecord): AwardLead | null {
  if (!r.noticeId || !r.award?.awardee?.name) return null;
  const amount = Number(String(r.award.amount ?? "").replace(/[^0-9.]/g, ""));
  return {
    noticeId: r.noticeId,
    title: r.title ?? "",
    agency: (r.fullParentPathName ?? "").split(".").slice(0, 2).join(" / "),
    awardee: r.award.awardee.name,
    amountUsd: Number.isFinite(amount) && amount > 0 ? amount : null,
    awardedOn: day(r.award.date),
    naics: String(r.naicsCode ?? ""),
    url: r.uiLink ?? `https://sam.gov/opp/${r.noticeId}/view`,
  };
}
