/**
 * Leads: listings found by the AI web scout, an RSS feed or a pasted link. A lead states only what the page states;
 * everything else stays unknown, and it is never marked verified. Turning a lead into an Opportunity is the only
 * place those sources meet the engine.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { applyPatch, extractTerms, newOpportunity, newTerms } from "@/engine";
import type { BuyerLevel, DocLink, Fit, Opportunity, ServiceCategory, SourceId } from "@/engine/types";
import { categoryFrom } from "./sam-normalize";

export interface Lead {
  title: string;
  agency: string;
  solicitationNumber: string;
  city: string;
  state: string;
  dueDate: string | null;
  postedDate: string | null;
  estimatedValueUsd: number | null;
  naics: string | null;
  level: BuyerLevel | null;
  /** Where it was found, e.g. "Texas SmartBuy" or a feed name. */
  portal: string;
  sourceUrl: string;
  summary: string;
  /** Why the scout thought it fits (AI scout only). Advisory text. */
  whyItFits: string;
  documents: DocLink[];
}

/** An opportunity found by a scout, with how well it fits and why it was or was not shown prominently. */
export interface ScoutItem {
  opportunity: Opportunity;
  fit: Fit;
  whyItFits: string;
  portal: string;
}

export interface ScoutResult {
  items: ScoutItem[];
  notes: string[];
  /** How many candidates were dropped (past due, no usable link, link not seen in the search). */
  dropped: number;
  searches: number;
  model: string | null;
}

/** FNV-1a: a short, stable id so scouting the same listing twice does not create two pipeline entries. */
export function stableId(prefix: string, ...parts: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|").toLowerCase().replace(/\s+/g, " ").trim()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}-${h.toString(16).padStart(8, "0")}`;
}

const CATEGORY_WORDS: Array<[ServiceCategory, RegExp]> = [
  ["security-guard", /\b(security\s+guard|guard\s+services|armed\s+guard|patrol|security\s+services)\b/i],
  ["construction-specialty", /\b(electrical|plumbing|hvac|roofing|paving|asphalt|concrete|fencing|painting|flooring|elevator)\b/i],
  ["construction-general", /\b(construction|grading|clearing|earthwork|excavation|site\s+(?:work|preparation)|demolition|renovation|road(?:way)?|bridge|drainage|utilities)\b/i],
  ["facility-services", /\b(janitorial|custodial|cleaning|landscap\w*|mowing|grounds|maintenance|pest\s+control|waste|trash|refuse)\b/i],
  ["professional-services", /\b(engineering|architect\w*|consult\w*|survey\w*|inspection|design\s+services|audit|legal|training)\b/i],
  ["supply", /\b(supplies|supply|purchase\s+of|furniture|equipment|vehicles?|uniforms?|materials|parts)\b/i],
];

export function inferCategory(title: string, summary: string, naics: string | null): ServiceCategory {
  if (naics) {
    const byCode = categoryFrom(naics, "");
    if (byCode !== "unknown") return byCode;
  }
  const text = `${title} ${summary}`;
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(text)) return cat;
  return "unknown";
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
export const cleanDate = (s: string | null | undefined): string | null => (s && ISO.test(s) && !Number.isNaN(Date.parse(s.slice(0, 10))) ? s.slice(0, 10) : null);

export function safeHttpUrl(s: string): string | null {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function leadToOpportunity(lead: Lead, source: SourceId, checkedOn: string): Opportunity {
  const category = inferCategory(lead.title, lead.summary, lead.naics);
  const patch = extractTerms(`${lead.title}. ${lead.summary}`);
  const origin: Record<string, string> = {
    web: "Found by the AI web scout",
    feed: "Read from a bid feed",
    "url-import": "Read from a link you pasted",
  };
  return newOpportunity({
    id: stableId(source === "web" ? "web" : source === "feed" ? "feed" : "url", lead.sourceUrl || `${lead.title}|${lead.agency}`),
    source,
    solicitationNumber: lead.solicitationNumber,
    title: lead.title,
    agency: lead.agency,
    scope: lead.summary,
    category,
    location: { city: lead.city, state: lead.state },
    postedDate: lead.postedDate,
    dueDate: lead.dueDate,
    valueEstimate: { low: lead.estimatedValueUsd, high: lead.estimatedValueUsd },
    sourceUrl: lead.sourceUrl,
    documents: lead.documents,
    naics: lead.naics,
    level: lead.level,
    terms: applyPatch(newTerms(), patch),
    provenance: {
      verified: false,
      checkedOn,
      note: `${origin[source] ?? "Imported"}${lead.portal ? ` (${lead.portal})` : ""}. Dates, value and terms come from a summary, not the solicitation. Open the official listing and read the documents before relying on any of it.`,
    },
  });
}
