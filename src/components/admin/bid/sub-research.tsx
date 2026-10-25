"use client";
import { useState } from "react";
import type { Settings } from "@/engine/types";
import { safeUrl } from "@/components/format";
import { Badge, Button, Field, Input, Notice } from "@/components/ui";
import { researchSubsApi } from "@/lib/api";
import { subFromResearch } from "@/lib/intake";
import { actions, useAppState, type PipelineItem } from "@/lib/store";
import type { SubResearchResult } from "@/server/ai/sub-research";

/**
 * Finds real companies on the web that could do the work and files them, unverified, in the directory.
 * The AI only finds names and what their own pages state; licenses, insurance, capacity and willingness stay unconfirmed.
 */
export function SubResearchPanel({ item, settings, aiEnabled }: { item: PipelineItem; settings: Settings; aiEnabled: boolean }) {
  const state = useAppState();
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubResearchResult | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const have = new Set((state?.subcontractors ?? []).map((s) => s.name.toLowerCase()));

  async function run() {
    setBusy(true);
    setError(null);
    const res = await researchSubsApi(item.opportunity, settings, extra);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setResult(res.data);
  }

  const addOne = (s: SubResearchResult["subs"][number]) => {
    actions.upsertSub(
      subFromResearch({
        name: s.name,
        services: s.services,
        coverage: [s.state, s.city].filter(Boolean),
        contact: [s.phone && `Phone: ${s.phone}`, s.email && `Email: ${s.email}`, s.website && `Web: ${s.website}`].filter(Boolean).join("\n"),
        notes: `Found by AI web research for "${item.opportunity.title}". ${s.whyFits} Source: ${s.sourceUrl}. ${s.licenses.length ? `Page states licenses: ${s.licenses.join(", ")} (not verified). ` : ""}Nothing verified yet: confirm license, insurance, capacity and willingness before relying on them.`,
        similar: s.similarWork ? [{ description: s.similarWork, year: null }] : [],
      }),
    );
    setAdded((a) => new Set(a).add(s.name));
  };

  return (
    <div>
      {!aiEnabled && <Notice tone="unknown" className="mb-3">Needs <code>ANTHROPIC_API_KEY</code> on the server.</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Anything specific? (optional)" hint="e.g. “must have a dump truck” or “woman-owned”">
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={300} />
        </Field>
        <Button variant="primary" disabled={busy || !aiEnabled} onClick={() => void run()} className="h-10">{busy ? "Researching…" : "Research subcontractors"}</Button>
      </div>
      {busy && <p className="mt-2 text-xs text-muted">The AI is searching the web. This can take a minute or two.</p>}
      {error && <Notice tone="fail" className="mt-3">{error}</Notice>}
      {result && (
        <div className="mt-4">
          {result.notes.map((n, i) => <p key={i} className="mb-1 text-xs text-muted">{n}</p>)}
          {result.subs.length > 1 && (
            <Button className="mb-3" onClick={() => result.subs.filter((s) => !have.has(s.name.toLowerCase()) && !added.has(s.name)).forEach(addOne)}>Add all to my directory</Button>
          )}
          <ul className="space-y-3">
            {result.subs.map((s) => {
              const isAdded = added.has(s.name) || have.has(s.name.toLowerCase());
              return (
                <li key={s.name} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 max-w-2xl">
                      <p className="font-medium">{s.name} <Badge className="ml-1">Unverified</Badge></p>
                      <p className="text-xs text-muted">{[s.city, s.state].filter(Boolean).join(", ") || "location not stated"}{s.services.length ? ` · ${s.services.join(", ")}` : ""}</p>
                      {s.whyFits && <p className="mt-1 text-sm">{s.whyFits}</p>}
                      {s.similarWork && <p className="mt-1 text-xs text-muted">Similar work: {s.similarWork}</p>}
                      {s.licenses.length > 0 && <p className="mt-1 text-xs text-muted">Page says licensed: {s.licenses.join(", ")} (verify with the issuing authority)</p>}
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {s.phone && <span>☎ {s.phone}</span>}
                        {s.email && <a className="text-accent underline" href={`mailto:${s.email}`}>{s.email}</a>}
                        {safeUrl(s.website) && <a className="text-accent underline" href={safeUrl(s.website) ?? undefined} target="_blank" rel="noopener noreferrer">Website ↗</a>}
                        {safeUrl(s.sourceUrl) && <a className="text-muted underline" href={safeUrl(s.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Where it was found ↗</a>}
                      </p>
                    </div>
                    <Button disabled={isAdded} onClick={() => addOne(s)}>{isAdded ? "In your directory" : "Add to my directory"}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Contact details are only what each page states. Call before relying on anyone: confirm they do this work here, hold the license, carry insurance, and will subcontract under your terms.</p>
        </div>
      )}
    </div>
  );
}
