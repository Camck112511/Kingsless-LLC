"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Verdict } from "@/engine/types";
import { fmtDate, fmtPct, fmtUsd } from "@/components/format";
import { Badge, Button, Card, Notice, PageHeader, Select, Stat, cn } from "@/components/ui";
import { actions, STATUS_LABELS, useAppState, type PipelineStatus } from "@/lib/store";
import { useAnalyses } from "@/lib/use-analyses";
import { VerdictBadge } from "./verdict";

const FILTERS: Array<{ id: "all" | Verdict; label: string }> = [
  { id: "all", label: "All" },
  { id: "bid-ready", label: "Bid-ready" },
  { id: "qualified", label: "Qualified" },
  { id: "investigate", label: "Investigate" },
  { id: "reject", label: "Rejected" },
];

export function Dashboard() {
  const state = useAppState();
  const view = useAnalyses(state);
  const [filter, setFilter] = useState<"all" | Verdict>("all");

  const itemsById = useMemo(() => new Map((state?.items ?? []).map((i) => [i.opportunity.id, i])), [state]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: view.ordered.length };
    for (const a of view.ordered) c[a.verdict] = (c[a.verdict] ?? 0) + 1;
    return c;
  }, [view.ordered]);
  const rows = view.ordered.filter((a) => filter === "all" || a.verdict === filter);

  if (!state) return <p className="text-sm text-muted">Loading your pipeline…</p>;

  const missingTests = state.items.length === 0;

  return (
    <>
      <PageHeader
        title="Opportunity pipeline"
        subtitle="Ranked by verdict, then by expected profit discounted for payment delay and the cash you must put up first. Nothing is recommended until the three hard rules are proven."
        actions={
          <>
            <Link href="/admin/discover" className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">
              Discover
            </Link>
            <Link href="/admin/new" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
              Add opportunity
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Capital available" value={fmtUsd(state.settings.availableCapitalUsd)} sub="Hard ceiling for any deal" />
        <Stat label="Bid-ready" value={counts["bid-ready"] ?? 0} tone="pass" />
        <Stat label="Qualified" value={counts.qualified ?? 0} tone="info" />
        <Stat label="Investigate" value={counts.investigate ?? 0} tone="unknown" />
        <Stat label="Rejected" value={counts.reject ?? 0} tone="fail" />
      </div>

      {missingTests ? (
        <Card className="text-center">
          <h2 className="text-lg font-semibold">No opportunities yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
            Load the three live solicitations the engine was designed around (Fort Worth 26-0268, LAMP RFP-0003 and RFP-0005) to see how it accepts, rejects and questions real listings, or add your own.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => actions.loadTestCases()}>
              Load the 3 live test cases
            </Button>
            <Link href="/admin/new" className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">
              Add one manually
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by verdict">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn("rounded-full px-3 py-1 text-sm transition", filter === f.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink")}
              >
                {f.label} <span className="opacity-70">{counts[f.id] ?? 0}</span>
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-xs text-muted">
              {view.loading && "Updating…"}
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => actions.loadTestCases()}>
                Re-add test cases
              </Button>
            </span>
          </div>

          {view.error && <Notice tone="fail" className="mb-3">{view.error}</Notice>}

          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Opportunity</th>
                  <th className="px-3 py-3">Verdict</th>
                  <th className="px-3 py-3 text-right">Exp. profit</th>
                  <th className="px-3 py-3 text-right">Win chance</th>
                  <th className="px-3 py-3 text-right">Cash first</th>
                  <th className="px-3 py-3 text-right">1st payment</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const item = itemsById.get(a.opportunityId);
                  if (!item) return null;
                  const o = item.opportunity;
                  return (
                    <tr key={a.opportunityId} className="align-top transition hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <Link href={`/admin/opportunities/${encodeURIComponent(o.id)}`} className="font-medium hover:text-accent">
                          {o.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {o.solicitationNumber || "no number"} · {o.agency || "unknown agency"}
                        </p>
                        {!o.provenance.verified && <Badge className="mt-1.5">Unverified listing</Badge>}
                      </td>
                      <td className="px-3 py-3">
                        <VerdictBadge verdict={a.verdict} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtUsd(a.expectedProfitUsd)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtPct(a.winProbability.value)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.cash ? fmtUsd(a.cash.peakCashRequiredUsd) : "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.cash ? `${a.cash.daysToFirstPayment} d` : "—"}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {fmtDate(o.dueDate)}
                        {a.daysToDeadline !== null && <p className="text-xs text-muted">{a.daysToDeadline < 0 ? "passed" : `${a.daysToDeadline} d left`}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <Select aria-label={`Status for ${o.title}`} value={item.status} onChange={(e) => actions.updateItem(o.id, { status: e.target.value as PipelineStatus })} className="!py-1 text-xs">
                          {(Object.keys(STATUS_LABELS) as PipelineStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted">
                      Nothing in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Expected profit is a probability-weighted estimate before tax. Win chance is a transparent heuristic, not a forecast. Cash first is the peak money you must put up before the customer pays.
          </p>
        </>
      )}
    </>
  );
}
