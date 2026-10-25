"use client";
/** Thin typed wrappers around the admin API. PROTECTED. */
import type { Analysis, Terms } from "@/engine/types";
import type { ScriptSet } from "@/engine/scripts";
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

export const discoverApi = (q: { daysBack: number; keyword?: string; ncode?: string; state?: string; limit: number; kind: "solicitations" | "awards" }) =>
  postJson<DiscoveryResult>("/api/admin/discover", q);

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/admin/login";
}
