"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Verdict } from "@/engine/types";
import { fmtDate, fmtPct, fmtUsd } from "@/components/format";
import { Badge, Button, Card, Notice, PageHeader, Select, Stat, cn } from "@/components/ui";
import { actions, STATUS_LABELS, useAppState, type PipelineStatus } from "@/lib/store";
import { useAnalyses } from "@/lib/use-analyses";
import { US_STATES } from "@/lib/us-states";
import { LocationPicker } from "./location-picker";
import { FitMeter, isRecommended, RecommendationBadge } from "./recommendation";
import { VerdictBadge } from "./verdict";

type Filter = "all" | "picks" | Verdict;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "picks", label: "Recommended" },
  { id: "bid-ready", label: "Bid-ready" },
  { id: "qualified", label: "Qualified" },
  { id: "investigate", label: "Investigate" },
  { id: "reject", label: "Rejected" },
];

export function Dashboard() {
  const state = useAppState();
  const view = useAnalyses(state);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingArea, setEditingArea] = useState(false);

  const itemsById = useMemo(() => new Map((state?.items ?? []).map((i) => [i.opportunity.id, i])), [state]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: view.ordered.length };
    for (const a of view.ordered) {
      c[a.verdict] = (c[a.verdict] ?? 0) + 1;
      if (isRecommended(a.recommendation)) c.picks = (c.picks ?? 0) + 1;
    }
    return c;
  }, [view.ordered]);
  const picks = useMemo(() => view.ordered.filter((a) => isRecommended(a.recommendation)).slice(0, 4), [view.ordered]);
  const rows = view.ordered.filter((a) => (filter === "all" ? true : filter === "picks" ? isRecommended(a.recommendation) : a.verdict === filter));

  if (!state) return <p className="text-sm text-muted">Loading your pipeline…</p>;

  const missingTests = state.items.length === 0;
  const area = state.settings.serviceArea;
  const areaText =
    area.scope === "selected" && (area.states.length > 0 || area.places.length > 0)
      ? [area.places.join(", "), area.states.map((c) => US_STATES.find((s) => s.code === c)?.name ?? c).join(", ")].filter(Boolean).join(" · ")
      : "Anywhere (no location filter)";
  const outsideArea = view.ordered.filter((a) => a.gates.some((g) => g.id === "location" && g.status === "fail")).length;

  return (
    <>
      <PageHeader
        title="Your bids"
        subtitle="Ranked by what is proven, then by how well each listing fits your business and how much it earns for the cash and waiting it costs. Nothing is recommended until the three hard rules are proven."
        actions={
          <>
            <Link href="/admin/scout" className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">
              Find bids
            </Link>
            <Link href="/admin/new" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
              Add opportunity
            </Link>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Where you work</p>
            <p className="mt-0.5 text-base font-semibold">{areaText}</p>
            {area.scope === "selected" && outsideArea > 0 && <p className="mt-0.5 text-xs text-muted">{outsideArea} opportunit{outsideArea === 1 ? "y is" : "ies are"} outside this area and rejected.</p>}
          </div>
          <Button onClick={() => setEditingArea((v) => !v)}>{editingArea ? "Done" : "Change location"}</Button>
        </div>
        {editingArea && (
          <div className="mt-4 border-t border-line pt-4">
            <LocationPicker area={area} onChange={(serviceArea) => actions.setSettings({ ...state.settings, serviceArea })} />
          </div>
        )}
      </Card>

      {picks.length > 0 && (
        <section aria-label="Recommended bids" className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Best bids for your business</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {picks.map((a) => {
              const o = itemsById.get(a.opportunityId)?.opportunity;
              if (!o) return null;
              return (
                <Link key={a.opportunityId} href={`/admin/opportunities/${encodeURIComponent(o.id)}/bid`} className="group block rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:border-accent">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium group-hover:text-accent">{o.title}</p>
                    <RecommendationBadge recommendation={a.recommendation} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {o.agency || "Unknown agency"} · {[o.location.city, o.location.state].filter(Boolean).join(", ") || "location not stated"} · due {fmtDate(o.dueDate)}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><dt className="text-muted">Exp. profit</dt><dd className="text-sm font-semibold tabular-nums">{fmtUsd(a.expectedProfitUsd)}</dd></div>
                    <div><dt className="text-muted">Win chance</dt><dd className="text-sm font-semibold tabular-nums">{fmtPct(a.winProbability.value)}</dd></div>
                    <div><dt className="text-muted">Fit</dt><dd className="flex justify-center pt-1"><FitMeter fit={a.fit} /></dd></div>
                  </dl>
                  <p className="mt-3 text-xs font-medium text-accent">Open the bid workspace →</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Opportunity</th>
                  <th className="px-3 py-3">Verdict</th>
                  <th className="px-3 py-3">Fit</th>
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
                        <div className="flex flex-col items-start gap-1">
                          <VerdictBadge verdict={a.verdict} />
                          <RecommendationBadge recommendation={a.recommendation} />
                        </div>
                      </td>
                      <td className="px-3 py-3"><FitMeter fit={a.fit} /></td>
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
                    <td colSpan={9} className="px-4 py-8 text-center text-muted">
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
