"use client";
import { useState } from "react";
import type { Settings } from "@/engine/types";
import { fmtDate, fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, CardTitle, Field, Notice, Select } from "@/components/ui";
import { awardsApi, type AwardsResponse } from "@/lib/api";
import { subFromResearch } from "@/lib/intake";
import { actions, useAppState } from "@/lib/store";
import { US_STATES } from "@/lib/us-states";
import { TagField } from "./fields";

/**
 * What has the government actually paid for this kind of work here, and who did it? Free federal data (USAspending.gov).
 * The numbers come from the server; this panel only shows them.
 */
export function MarketPanel({
  settings,
  initial,
  onUseMedian,
}: {
  settings: Settings;
  initial?: { keywords: string[]; naics: string[]; state: string };
  onUseMedian?: (usd: number) => void;
}) {
  const state = useAppState();
  const area = settings.serviceArea;
  const defaultState = initial?.state ?? (area.scope === "selected" ? (area.states[0] ?? "") : "");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? settings.targeting.keywords.slice(0, 3));
  const [naics, setNaics] = useState<string[]>(initial?.naics ?? settings.targeting.naics.slice(0, 3));
  const [st, setSt] = useState(defaultState);
  const [busy, setBusy] = useState<"awards" | "subawards" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardsResponse | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const have = new Set((state?.subcontractors ?? []).map((s) => s.name.toLowerCase()));

  async function run(mode: "awards" | "subawards") {
    setBusy(mode);
    setError(null);
    setResult(null);
    const res = await awardsApi(mode, { keywords, naics, states: st ? [st] : [] });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setResult(res.data);
  }

  return (
    <Card>
      <CardTitle>Market research from federal records</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-muted">
        USAspending.gov shows what federal agencies actually paid for similar work and which subcontractors prime contractors have already hired. It covers federal contracts only; state and local prices are not included.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Words"><TagField aria-label="Market words" value={keywords} onChange={setKeywords} placeholder="grading, janitorial" /></Field>
        <Field label="NAICS codes"><TagField aria-label="Market NAICS" value={naics} onChange={setNaics} normalize={(s) => (/^\d{2,6}$/.test(s.trim()) ? s.trim() : "")} placeholder="238910" /></Field>
        <Field label="Work performed in">
          <Select value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">Anywhere in the US</option>
            {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy !== null || keywords.length + naics.length === 0} onClick={() => void run("awards")}>{busy === "awards" ? "Searching…" : "What has been paid"}</Button>
        <Button disabled={busy !== null || keywords.length + naics.length === 0} onClick={() => void run("subawards")}>{busy === "subawards" ? "Searching…" : "Who the primes hired"}</Button>
      </div>
      {error && <Notice tone="fail" className="mt-4">{error}</Notice>}

      {result?.mode === "awards" && (
        <div className="mt-5">
          {result.stats.count === 0 ? (
            <p className="text-sm text-muted">No matching federal contracts found. Try fewer words or a broader code.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Typical low</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(result.stats.lowUsd)}</p></div>
                <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Middle (median)</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(result.stats.medianUsd)}</p></div>
                <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Typical high</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(result.stats.highUsd)}</p></div>
              </div>
              <p className="mt-2 text-xs text-muted">From {result.stats.count} federal contracts, last 3 years. Federal prices are a guide, not a quote; your listing may differ in size and scope.</p>
              {onUseMedian && result.stats.medianUsd !== null && (
                <Button className="mt-3" onClick={() => onUseMedian(result.stats.medianUsd as number)}>Use {fmtUsd(result.stats.medianUsd)} as the expected market price</Button>
              )}
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
                {result.awards.slice(0, 15).map((a) => (
                  <li key={`${a.awardId}-${a.recipient}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0 max-w-xl">
                      <p className="font-medium">{a.recipient}</p>
                      <p className="line-clamp-2 text-xs text-muted">{a.description || "No description"}</p>
                      <p className="text-xs text-muted">{a.agency} · {a.place || "place not stated"} · {fmtDate(a.startDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{fmtUsd(a.amountUsd)}</p>
                      {safeUrl(a.url) && <a className="text-xs text-accent underline" href={safeUrl(a.url) ?? undefined} target="_blank" rel="noopener noreferrer">Record ↗</a>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {result?.mode === "subawards" && (
        <div className="mt-5">
          {result.subawardees.length === 0 ? (
            <p className="text-sm text-muted">No subawards found. Only primes above federal reporting thresholds file them, so a short list is not proof that nobody does this work.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">Real companies that primes hired for similar federal work. Nothing here is verified: confirm licenses, insurance, capacity and willingness before relying on anyone.</p>
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {result.subawardees.slice(0, 20).map((s) => {
                  const isAdded = added.has(s.name) || have.has(s.name.toLowerCase());
                  return (
                    <li key={s.name} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0 max-w-xl">
                        <p className="font-medium">{s.name} <Badge className="ml-1">Unverified</Badge></p>
                        <p className="text-xs text-muted">
                          {s.count} subaward{s.count === 1 ? "" : "s"} · {fmtUsd(s.totalUsd)} total{s.latest ? ` · latest ${fmtDate(s.latest)}` : ""}{s.states.length ? ` · ${s.states.join(", ")}` : ""}
                        </p>
                        {s.examples[0]?.description && <p className="line-clamp-2 text-xs text-muted">e.g. {s.examples[0].description} (prime: {s.examples[0].prime || "unknown"})</p>}
                      </div>
                      <Button
                        disabled={isAdded}
                        onClick={() => {
                          actions.upsertSub(
                            subFromResearch({
                              name: s.name,
                              services: keywords,
                              coverage: s.states,
                              notes: `Found in USAspending subaward records: ${s.count} subaward(s) totalling ${fmtUsd(s.totalUsd)}${s.uei ? `, UEI ${s.uei}` : ""}. Contact details are not in the record. Nothing verified yet.`,
                              similar: s.examples.filter((e) => e.description).map((e) => ({ description: `${e.description} (sub to ${e.prime || "a prime"})`, year: e.date ? Number(e.date.slice(0, 4)) : null })),
                            }),
                          );
                          setAdded((a) => new Set(a).add(s.name));
                        }}
                      >
                        {isAdded ? "In your directory" : "Add to my directory"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
