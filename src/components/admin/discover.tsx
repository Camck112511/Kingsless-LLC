"use client";
import { useState } from "react";
import { fmtDate, fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { discoverApi } from "@/lib/api";
import { actions, useAppState } from "@/lib/store";
import type { DiscoveryResult } from "@/server/sources/types";

export function Discover() {
  const state = useAppState();
  const [kind, setKind] = useState<"solicitations" | "awards">("solicitations");
  const [keyword, setKeyword] = useState("");
  const [ncode, setNcode] = useState("");
  const [st, setSt] = useState("TX");
  const [daysBack, setDaysBack] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await discoverApi({ kind, daysBack: Math.min(90, Math.max(1, Number(daysBack) || 14)), keyword: keyword.trim() || undefined, ncode: ncode.trim() || undefined, state: st.trim() || undefined, limit: 25 });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setResult(res.data);
  }

  const inPipeline = new Set((state?.items ?? []).map((i) => i.opportunity.id));

  return (
    <>
      <PageHeader title="Discover" subtitle="Live federal opportunities from SAM.gov (official source). Each search is one API request, so searches only run when you press the button." />
      <form onSubmit={run} className="mb-6">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Show">
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="solicitations">Open solicitations</option>
                <option value="awards">Award notices (who wins)</option>
              </Select>
            </Field>
            <Field label="Title keyword"><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="grading, janitorial…" /></Field>
            <Field label="NAICS code"><Input value={ncode} onChange={(e) => setNcode(e.target.value)} placeholder="237310" inputMode="numeric" /></Field>
            <Field label="State"><Input value={st} maxLength={2} onChange={(e) => setSt(e.target.value)} /></Field>
            <Field label="Posted in last (days)"><Input value={daysBack} inputMode="numeric" onChange={(e) => setDaysBack(e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Searching…" : "Search SAM.gov"}</Button>
            <span className="text-xs text-muted">Needs SAM_GOV_API_KEY on the server. Award notices show established primes you could approach as a subcontractor.</span>
          </div>
        </Card>
      </form>

      {error && <Notice tone="fail" className="mb-4">{error}</Notice>}

      {result && (
        <>
          <p className="mb-3 text-sm text-muted">{result.totalRecords} record(s) match; showing {result.opportunities.length + result.awards.length}. {result.note}</p>
          <ul className="space-y-3">
            {result.opportunities.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <div className="min-w-0 max-w-3xl">
                  <p className="font-medium">{o.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{o.solicitationNumber || "no number"} · {o.agency} · due {fmtDate(o.dueDate)} · {o.location.city || "—"} {o.location.state}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={o.terms.setAside === "none" ? "pass" : "info"}>Set-aside: {o.terms.setAside}</Badge>
                    <Badge>{o.category}</Badge>
                  </p>
                  {safeUrl(o.sourceUrl) && <a href={safeUrl(o.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent underline">Official notice ↗</a>}
                </div>
                <Button variant="primary" disabled={inPipeline.has(o.id) || added.has(o.id)} onClick={() => { actions.addItems([o]); setAdded((s) => new Set(s).add(o.id)); }}>
                  {inPipeline.has(o.id) || added.has(o.id) ? "In pipeline" : "Add to pipeline"}
                </Button>
              </li>
            ))}
            {result.awards.map((a) => (
              <li key={a.noticeId} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <p className="font-medium">{a.awardee}</p>
                <p className="mt-0.5 text-sm">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted">{a.agency} · awarded {fmtDate(a.awardedOn)} · {fmtUsd(a.amountUsd)} · NAICS {a.naics}</p>
                {safeUrl(a.url) && <a href={safeUrl(a.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent underline">Award notice ↗</a>}
              </li>
            ))}
            {result.opportunities.length + result.awards.length === 0 && <li className="text-sm text-muted">No results for that search.</li>}
          </ul>
        </>
      )}

      <Card className="mt-8">
        <h2 className="mb-2 text-base font-semibold">Other sources: add by hand</h2>
        <p className="text-sm text-muted">These portals have no public data feed the engine can use, so add their listings on the Add page and paste the solicitation text.</p>
        <ul className="mt-3 space-y-1 text-sm">
          <li><a className="text-accent underline" href="https://fortworthtexas.bonfirehub.com/portal/?tab=openOpportunities" target="_blank" rel="noopener noreferrer">City of Fort Worth: Bonfire portal ↗</a></li>
          <li><a className="text-accent underline" href="https://lamptx.com/vendors/" target="_blank" rel="noopener noreferrer">LAMP Texas: vendor opportunities ↗</a></li>
          <li><a className="text-accent underline" href="https://www.txsmartbuy.gov/esbd" target="_blank" rel="noopener noreferrer">Texas SmartBuy: Electronic State Business Daily ↗</a></li>
        </ul>
      </Card>
    </>
  );
}
