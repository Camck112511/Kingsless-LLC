"use client";
import { useEffect, useMemo, useState } from "react";
import { bidPlanApi, type BidPlan } from "./api";
import type { AppState } from "./store";

interface Settled {
  key: string;
  plan: BidPlan | null;
  error: string | null;
}

/** The bid workspace's data: steps, documents and checks, computed by the engine on the server (debounced). PROTECTED. */
export function useBidPlan(state: AppState | null, id: string, recipient: string): { plan: BidPlan | null; loading: boolean; error: string | null } {
  const [settled, setSettled] = useState<Settled | null>(null);
  const item = state?.items.find((i) => i.opportunity.id === id);
  const key = useMemo(
    () => (state && item ? JSON.stringify([state.settings, state.subcontractors, state.quotes.filter((q) => q.opportunityId === id), item.opportunity, item.inputs, item.bid, recipient]) : ""),
    [state, item, id, recipient],
  );

  useEffect(() => {
    if (!state || !item) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await bidPlanApi(state, id, recipient);
      if (cancelled) return;
      setSettled(res.ok ? { key, plan: res.data, error: null } : { key, plan: null, error: res.error });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` captures every input that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!state || !item) return { plan: null, loading: !state, error: null };
  return { plan: settled?.plan ?? null, loading: settled?.key !== key, error: settled?.error ?? null };
}
