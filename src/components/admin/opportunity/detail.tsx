"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtPct, fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, CardTitle, Notice, Select, Textarea } from "@/components/ui";
import { actions, STATUS_LABELS, useAppState, type PipelineStatus } from "@/lib/store";
import { useAnalyses } from "@/lib/use-analyses";
import { VerdictBadge } from "../verdict";
import { EconomicsPanel } from "./economics";
import { GatesPanel } from "./gates";
import { ScriptsPanel } from "./scripts";
import { ShortlistPanel } from "./shortlist";
import { TermsPanel } from "./terms";

export function OpportunityDetail({ id }: { id: string }) {
  const state = useAppState();
  const router = useRouter();
  const view = useAnalyses(state, { onlyId: id, withScripts: true });

  if (!state) return <p className="text-sm text-muted">Loading…</p>;
  const item = state.items.find((i) => i.opportunity.id === id);
  if (!item) {
    return (
      <Card>
        <p className="font-medium">Opportunity not found.</p>
        <p className="mt-1 text-sm text-muted">It may have been removed, or your data lives in a different browser. <Link href="/admin" className="underline">Back to the pipeline</Link></p>
      </Card>
    );
  }
  const o = item.opportunity;
  const a = view.byId[id];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-ink">← Pipeline</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {o.solicitationNumber || "No solicitation number"} · {o.agency || "Unknown agency"} · due {fmtDate(o.dueDate)}
              {safeUrl(o.sourceUrl) && <> · <a href={safeUrl(o.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-accent underline">Official listing ↗</a></>}
            </p>
          </div>
          <div className="flex items-center gap-2">{a && <VerdictBadge verdict={a.verdict} />}</div>
        </div>
      </div>

      {!o.provenance.verified && (
        <Notice tone="unknown">
          <strong>Unverified listing.</strong> {o.provenance.note || "These facts have not been confirmed against the official portal."} Tick the confirmation box under “Solicitation facts” once you have.
        </Notice>
      )}
      {view.error && <Notice tone="fail">{view.error}</Notice>}

      {a ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <CardTitle>Verdict</CardTitle>
              <p className="text-sm leading-relaxed">{a.verdictReason}</p>
              {a.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-unknown">{a.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
            </div>
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div><dt className="text-xs text-muted">Win chance</dt><dd className="text-xl font-semibold tabular-nums">{fmtPct(a.winProbability.value)}</dd></div>
              <div><dt className="text-xs text-muted">Exp. profit</dt><dd className="text-xl font-semibold tabular-nums">{fmtUsd(a.expectedProfitUsd)}</dd></div>
              <div><dt className="text-xs text-muted">Days left</dt><dd className="text-xl font-semibold tabular-nums">{a.daysToDeadline ?? "—"}</dd></div>
            </dl>
          </div>
          <div className="mt-4 grid gap-5 border-t border-line pt-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Next</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">{a.nextActions.map((n, i) => <li key={i}>{n}</li>)}</ol>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Why {fmtPct(a.winProbability.value)}?</h3>
              <ul className="space-y-1 text-xs text-muted">
                <li>Starts at {fmtPct(a.winProbability.base)}</li>
                {a.winProbability.factors.map((f, i) => <li key={i}>× {f.multiplier.toFixed(2)} {f.label}: {f.reason}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">{a.winProbability.note}</p>
            </div>
          </div>
          {a.openQuestions.length > 0 && (
            <details className="mt-4 border-t border-line pt-3 text-sm" open={a.verdict === "investigate"}>
              <summary className="cursor-pointer font-medium">Open questions ({a.openQuestions.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{a.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </details>
          )}
        </Card>
      ) : (
        <Card><p className="text-sm text-muted">{view.loading ? "Running the engine…" : "No analysis yet."}</p></Card>
      )}

      {a && <GatesPanel analysis={a} />}
      <EconomicsPanel item={item} analysis={a} />
      <ShortlistPanel item={item} analysis={a} state={state} />
      <ScriptsPanel set={view.scripts[id]} />
      <TermsPanel opportunity={o} />

      <Card>
        <CardTitle>Your decision</CardTitle>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <Select value={item.status} onChange={(e) => actions.updateItem(id, { status: e.target.value as PipelineStatus })}>
              {(Object.keys(STATUS_LABELS) as PipelineStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
            <span className="mt-2 block text-xs text-muted">The engine advises; you decide. Moving to “Approved” does not send anything.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes</span>
            <Textarea value={item.notes} onChange={(e) => actions.updateItem(id, { notes: e.target.value })} placeholder="Calls made, answers received, anything you verified…" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <Badge>Added {fmtDate(item.addedAt)}</Badge>
          <Button variant="danger" onClick={() => { if (window.confirm("Remove this opportunity and its quotes from your pipeline?")) { actions.removeItem(id); router.push("/admin"); } }}>Remove from pipeline</Button>
        </div>
      </Card>
    </div>
  );
}
