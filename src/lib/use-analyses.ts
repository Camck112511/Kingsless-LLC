"use client";
import { useEffect, useMemo, useState } from "react";
import type { Analysis } from "@/engine/types";
import type { ScriptSet } from "@/engine/scripts";
import { analyzeState } from "./api";
import type { AppState } from "./store";

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface AnalysisView {
  /** In rank order (best first). */
  ordered: Analysis[];
  byId: Record<string, Analysis>;
  scripts: Record<string, ScriptSet>;
  loading: boolean;
  error: string | null;
}

interface Settled {
  key: string;
  ordered: Analysis[];
  scripts: Record<string, ScriptSet>;
  error: string | null;
}

const EMPTY: AnalysisView = { ordered: [], byId: {}, scripts: {}, loading: false, error: null };

/**
 * Sends the pipeline to the engine (debounced) and returns the results.
 * The browser never computes verdicts or money; it only displays what the engine returns. PROTECTED.
 */
export function useAnalyses(state: AppState | null, opts: { onlyId?: string; withScripts?: boolean } = {}): AnalysisView {
  const [settled, setSettled] = useState<Settled | null>(null);
  const { onlyId, withScripts } = opts;
  const empty = !state || state.items.length === 0 || (onlyId !== undefined && !state.items.some((i) => i.opportunity.id === onlyId));
  const key = useMemo(() => (state ? JSON.stringify([state, onlyId, withScripts]) : ""), [state, onlyId, withScripts]);

  useEffect(() => {
    if (!state || empty) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await analyzeState(state, { onlyId, withScripts, today: localToday() });
      if (cancelled) return; // a newer request superseded this one
      setSettled(res.ok ? { key, ordered: res.data.analyses, scripts: res.data.scripts ?? {}, error: null } : { key, ordered: [], scripts: {}, error: res.error });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` captures every input that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, empty]);

  if (!state) return { ...EMPTY, loading: true };
  if (empty) return EMPTY;
  const ordered = settled?.ordered ?? [];
  return {
    ordered,
    byId: Object.fromEntries(ordered.map((a) => [a.opportunityId, a])),
    scripts: settled?.scripts ?? {},
    loading: settled?.key !== key,
    error: settled?.error ?? null,
  };
}
