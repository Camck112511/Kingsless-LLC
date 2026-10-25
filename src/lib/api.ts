"use client";
/** Thin typed wrappers around the admin API. PROTECTED. */
import type { Analysis, BidDocument, Opportunity, PreflightCheck, ServiceArea, Settings, Terms, WorkflowStep } from "@/engine/types";
import type { ScriptSet } from "@/engine/scripts";
import type { ReviewResult } from "@/server/ai/review";
import type { SubResearchResult } from "@/server/ai/sub-research";
import type { ScoutResult } from "@/server/sources/leads";
import type { MarketStats, PastAward, SubAwardee } from "@/server/sources/usaspending";
import type { DiscoveryResult } from "@/server/sources/types";
import type { AppState } from "./store";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    if (res.status === 401 && typeof window !== "undefined") {
      // full reload on purpose: drops any client state tied to the expired session
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/admin/login";
      return { ok: false, error: "Signed out.", status: 401 };
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (!res.ok) return { ok: false, error: json.error ?? `Request failed (${res.status}).`, status: res.status };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again.", status: 0 };
  }
}

export interface AnalyzeResponse {
  asOf: string;
  engineVersion: string;
  analyses: Analysis[];
  scripts?: Record<string, ScriptSet>;
}

export const analyzeState = (s: AppState, opts: { onlyId?: string; withScripts?: boolean; today: string }) =>
  postJson<AnalyzeResponse>("/api/admin/analyze", {
    settings: s.settings,
    subcontractors: s.subcontractors,
    quotes: s.quotes,
    items: (opts.onlyId ? s.items.filter((i) => i.opportunity.id === opts.onlyId) : s.items).map((i) => ({ opportunity: i.opportunity, inputs: i.inputs })),
    today: opts.today,
    withScripts: opts.withScripts,
  });

export interface PricingResponse {
  pricing: {
    contractValueUsd: number;
    subPriceUsd: number;
    otherCostsUsd: number;
    grossSpreadUsd: number;
    profitBeforeTaxUsd: number;
    grossMarginRate: number;
    netMarginRate: number;
    subShareRate: number;
    markupOnCostRate: number;
  };
  marginAsMarkup: number | null;
  markupAsMargin: number;
}

export const calcPricingApi = (contractValueUsd: number, subPriceUsd: number, otherCostsUsd: number) =>
  postJson<PricingResponse>("/api/admin/pricing", { contractValueUsd, subPriceUsd, otherCostsUsd });

export interface ExtractResponse {
  terms: Terms;
  foundByRules: string[];
  ai: { requested: boolean; used: boolean; model: string | null; error: string | null; accepted: Array<{ field: string; value: string; quote: string }>; rejected: Array<{ field: string; reason: string }>; conflicts: string[] };
}

export const extractApi = (text: string, useAi: boolean, baseTerms?: Terms) => postJson<ExtractResponse>("/api/admin/extract", { text, useAi, baseTerms });

export const discoverApi = (q: { daysBack: number; keyword?: string; ncode?: string; state?: string; limit: number; kind: "solicitations" | "awards"; serviceArea?: ServiceArea }) =>
  postJson<DiscoveryResult>("/api/admin/discover", q);

/* --------------------------------- scouting --------------------------------- */

export const scoutWebApi = (settings: Settings, query: string) => postJson<ScoutResult>("/api/admin/scout/web", { settings, query, maxLeads: 12 });
export const scoutFeedsApi = (settings: Settings) => postJson<ScoutResult>("/api/admin/scout/feeds", { settings });
export const scoutSamApi = (settings: Settings, q: { keyword?: string; ncode?: string; state?: string }) => postJson<ScoutResult>("/api/admin/scout/sam", { settings, ...q });

export interface AwardsQuery {
  keywords: string[];
  naics: string[];
  states: string[];
  yearsBack?: number;
}
export type AwardsResponse = { mode: "awards"; awards: PastAward[]; stats: MarketStats } | { mode: "subawards"; subawardees: SubAwardee[] };
export const awardsApi = (mode: "awards" | "subawards", q: AwardsQuery) => postJson<AwardsResponse>("/api/admin/scout/awards", { mode, yearsBack: 3, limit: 30, ...q });

export interface ImportUrlResponse {
  finalUrl: string;
  contentType: string;
  title: string;
  text: string;
  truncated: boolean;
  links: Array<{ label: string; url: string }>;
  hints: { dueDate: string | null; solicitationNumber: string; naics: string };
}
export const importUrlApi = (url: string) => postJson<ImportUrlResponse>("/api/admin/import-url", { url });

export const reviewApi = (s: AppState, id: string, opts: { text: string; research: boolean }) => {
  const item = s.items.find((i) => i.opportunity.id === id);
  return postJson<ReviewResult>("/api/admin/review", {
    settings: s.settings,
    subcontractors: s.subcontractors,
    quotes: s.quotes.filter((q) => q.opportunityId === id),
    item: item ? { opportunity: item.opportunity, inputs: item.inputs } : undefined,
    text: opts.text,
    research: opts.research,
  });
};

export const researchSubsApi = (opportunity: Opportunity, settings: Settings, extra = "") =>
  postJson<SubResearchResult>("/api/admin/subs/research", { opportunity, settings, count: 8, extra });

/* ----------------------------------- bids ----------------------------------- */

export interface BidPlan {
  analysis: Analysis;
  steps: WorkflowStep[];
  currentId: WorkflowStep["id"];
  documents: BidDocument[];
  placeholders: string[];
  digest: string;
  checks: { email: PreflightCheck[]; portal: PreflightCheck[] };
  canSendEmail: boolean;
  emailConfigured: boolean;
}

function bidBody(s: AppState, id: string, recipient = "") {
  const item = s.items.find((i) => i.opportunity.id === id);
  return {
    settings: s.settings,
    subcontractors: s.subcontractors,
    quotes: s.quotes.filter((q) => q.opportunityId === id),
    item: item ? { opportunity: item.opportunity, inputs: item.inputs, bid: item.bid } : undefined,
    recipient,
  };
}

export const bidPlanApi = (s: AppState, id: string, recipient: string) => postJson<BidPlan>("/api/admin/bid/plan", bidBody(s, id, recipient));

export const bidSendApi = (s: AppState, id: string, mail: { to: string; subject: string; message: string; attachments: Array<{ filename: string; contentBase64: string }> }) =>
  postJson<{ id: string; to: string; attachments: string[] }>("/api/admin/bid/send", { ...bidBody(s, id, mail.to), ...mail, confirm: "SEND" });

/** Downloads a generated file. The browser saves it; nothing is sent anywhere. */
export async function bidDownload(s: AppState, id: string, what: { format: "docx" | "pdf" | "zip"; doc?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/admin/bid/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bidBody(s, id), ...what }), credentials: "same-origin" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? `Download failed (${res.status}).` };
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "bid-file";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/admin/login";
}
