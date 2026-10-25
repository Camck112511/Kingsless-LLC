"use client";
import Link from "next/link";
import { useState } from "react";
import type { Analysis, Quote, SubTermsKind } from "@/engine/types";
import { fmtDate, fmtUsd, todayIso } from "@/components/format";
import { Button, Card, CardTitle, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { actions, newId, type AppState, type PipelineItem } from "@/lib/store";
import { NumberField } from "../fields";
import { VerificationBadge } from "../verdict";

export function ShortlistPanel({ item, analysis, state }: { item: PipelineItem; analysis: Analysis | undefined; state: AppState }) {
  const oppId = item.opportunity.id;
  const quotes = state.quotes.filter((q) => q.opportunityId === oppId);
  const subName = (id: string) => state.subcontractors.find((s) => s.id === id)?.name ?? "Unknown sub";
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardTitle aside={<Button variant="secondary" onClick={() => setAdding((v) => !v)} disabled={state.subcontractors.length === 0}>{adding ? "Cancel" : "Enter a quote"}</Button>}>Subcontractor shortlist</CardTitle>

      {state.subcontractors.length === 0 && (
        <Notice tone="neutral" className="mb-4">
          Your directory is empty. <Link href="/admin/subcontractors" className="font-medium underline">Add subcontractors</Link> first; the engine then ranks the ones that fit this job. A directory listing is not proof a company will take the work.
        </Notice>
      )}

      {adding && <QuoteForm oppId={oppId} state={state} onDone={() => setAdding(false)} />}

      {analysis && analysis.candidates.length === 0 && state.subcontractors.length > 0 && (
        <p className="text-sm text-muted">No one in your directory lists a service matching this scope yet.</p>
      )}

      <ul className="space-y-3">
        {analysis?.candidates.map((c) => (
          <li key={c.subcontractorId} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{c.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Fit {c.fitScore}/100</span>
                <VerificationBadge label={c.label} />
              </div>
            </div>
            <p className="mt-1 text-sm">{c.quote ? <>Firm quote <strong>{fmtUsd(c.quote.amountUsd)}</strong> received {fmtDate(c.quote.receivedOn)}</> : <span className="text-muted">No usable quote yet</span>}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {c.checks.map((k) => (
                <li key={k.id} title={k.detail} className={k.ok === null ? "rounded-md bg-surface-2 px-2 py-0.5 text-muted" : k.ok ? "rounded-md bg-pass-soft px-2 py-0.5 text-pass" : "rounded-md bg-fail-soft px-2 py-0.5 text-fail"}>
                  {k.ok === null ? "–" : k.ok ? "✓" : "✕"} {k.label}
                </li>
              ))}
            </ul>
            {c.gaps.length > 0 && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">Missing before you can rely on them ({c.gaps.length})</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{c.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </details>
            )}
          </li>
        ))}
      </ul>

      {quotes.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold">Quotes on file</h3>
          <ul className="space-y-1 text-sm">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2">
                <span>
                  {subName(q.subcontractorId)}: {fmtUsd(q.amountUsd)} · {q.firm ? "firm" : "not firm"} · {q.terms.kind} · {fmtDate(q.receivedOn)}
                </span>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => actions.removeQuote(q.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function QuoteForm({ oppId, state, onDone }: { oppId: string; state: AppState; onDone: () => void }) {
  const [q, setQ] = useState<Quote>({
    id: newId("q"),
    opportunityId: oppId,
    subcontractorId: state.subcontractors[0]?.id ?? "",
    amountUsd: 0,
    receivedOn: todayIso(),
    validUntil: null,
    firm: true,
    scopeMatched: true,
    includes: { labor: true, materials: true, equipment: true, mobilization: true, insurance: true },
    exclusions: "",
    terms: { kind: "pay-when-paid", depositRate: 0, netDays: 0 },
  });
  const set = (p: Partial<Quote>) => setQ((x) => ({ ...x, ...p }));
  const valid = q.subcontractorId !== "" && q.amountUsd > 0;

  return (
    <div className="mb-5 rounded-xl border border-dashed border-line p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Subcontractor">
          <Select value={q.subcontractorId} onChange={(e) => set({ subcontractorId: e.target.value })}>
            {state.subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Quoted price"><NumberField prefix="$" value={q.amountUsd || null} onChange={(v) => set({ amountUsd: v ?? 0 })} /></Field>
        <Field label="Received"><Input type="date" value={q.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} /></Field>
        <Field label="Valid until" hint="Blank = 30 days"><Input type="date" value={q.validUntil ?? ""} onChange={(e) => set({ validUntil: e.target.value || null })} /></Field>
        <Field label="Their payment terms">
          <Select value={q.terms.kind} onChange={(e) => set({ terms: { ...q.terms, kind: e.target.value as SubTermsKind, depositRate: e.target.value === "deposit-balance" ? 0.3 : 0 } })}>
            <option value="pay-when-paid">Pay-when-paid (no deposit)</option>
            <option value="net">Net days after invoice</option>
            <option value="deposit-balance">Deposit, balance at completion</option>
            <option value="on-completion">All at completion</option>
          </Select>
        </Field>
        {(q.terms.kind === "deposit-balance") && <Field label="Deposit"><NumberField mode="rate" suffix="%" value={q.terms.depositRate} onChange={(v) => set({ terms: { ...q.terms, depositRate: Math.min(1, v ?? 0) } })} /></Field>}
        {q.terms.kind !== "pay-when-paid" && <Field label="Net days"><NumberField value={q.terms.netDays} onChange={(v) => set({ terms: { ...q.terms, netDays: v ?? 0 } })} /></Field>}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={q.firm} onChange={(e) => set({ firm: e.target.checked })} /> Firm written quote (not a ballpark)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={q.scopeMatched} onChange={(e) => set({ scopeMatched: e.target.checked })} /> Priced this exact scope</label>
      </div>
      <Field label="Exclusions / notes" className="mt-3"><Textarea value={q.exclusions} onChange={(e) => set({ exclusions: e.target.value })} className="min-h-16" /></Field>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={!valid} onClick={() => { actions.upsertQuote(q); onDone(); }}>Save quote</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
