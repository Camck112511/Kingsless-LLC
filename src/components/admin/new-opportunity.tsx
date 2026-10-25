"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ServiceCategory, SourceId } from "@/engine/types";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { extractApi } from "@/lib/api";
import { blankIntake, buildOpportunity, type IntakeForm } from "@/lib/intake";
import { actions, useAppState } from "@/lib/store";

const SOURCES: Array<[SourceId, string]> = [
  ["manual", "Other / manual"], ["sam.gov", "SAM.gov"], ["fort-worth-bonfire", "City of Fort Worth (Bonfire)"], ["lamp-texas", "LAMP Texas"], ["texas-esbd", "Texas SmartBuy (ESBD)"],
];
const CATEGORIES: Array<[ServiceCategory, string]> = [
  ["unknown", "Not sure"], ["supply", "Supply / goods"], ["construction-general", "General construction"], ["construction-specialty", "Specialty trade"],
  ["security-guard", "Security guard services"], ["facility-services", "Facility services"], ["professional-services", "Professional services"], ["other-services", "Other services"],
];

export function NewOpportunity() {
  const router = useRouter();
  const appState = useAppState();
  const defaultState = appState?.settings.serviceArea.scope === "selected" ? (appState.settings.serviceArea.states[0] ?? "") : "";
  const [f, setF] = useState<IntakeForm>(blankIntake());
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<IntakeForm>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let terms;
    if (text.trim().length >= 20) {
      const res = await extractApi(text, useAi);
      if (!res.ok) {
        setBusy(false);
        return setError(res.error);
      }
      terms = res.data.terms;
    }
    const opp = buildOpportunity({ ...f, state: f.state || defaultState, scope: f.scope || text.slice(0, 600) }, terms);
    actions.addItems([opp]);
    router.push(`/admin/opportunities/${encodeURIComponent(opp.id)}`);
  }

  return (
    <>
      <PageHeader
        title="Add an opportunity"
        subtitle="For listings the engine cannot fetch itself (Fort Worth's Bonfire portal, LAMP Texas, Texas SmartBuy, anything else). Always link the official listing, and paste the solicitation text so the engine can quote the clauses it relies on."
      />
      <form onSubmit={submit} className="space-y-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Title *" className="lg:col-span-2"><Input required value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Solicitation number"><Input value={f.solicitationNumber} onChange={(e) => set({ solicitationNumber: e.target.value })} /></Field>
            <Field label="Agency / owner"><Input value={f.agency} onChange={(e) => set({ agency: e.target.value })} /></Field>
            <Field label="Source">
              <Select value={f.source} onChange={(e) => set({ source: e.target.value as SourceId })}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="Category">
              <Select value={f.category} onChange={(e) => set({ category: e.target.value as ServiceCategory })}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="Due date"><Input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
            <Field label="City / county"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
            <Field label="State" hint={defaultState ? `Blank = ${defaultState} (your selected state)` : undefined}><Input maxLength={2} value={f.state} placeholder={defaultState} onChange={(e) => set({ state: e.target.value })} /></Field>
            <Field label="Official link" className="sm:col-span-2 lg:col-span-3"><Input type="url" value={f.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://" /></Field>
            <Field label="Scope (short)" className="sm:col-span-2 lg:col-span-3"><Textarea value={f.scope} onChange={(e) => set({ scope: e.target.value })} className="min-h-20" /></Field>
          </div>
        </Card>
        <Card>
          <Field label="Solicitation text (recommended)" hint="Paste the instructions, scope, insurance, subcontracting and payment sections. The reader reports only what the text states, with the sentence as evidence.">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48" />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Also use the AI reader (needs ANTHROPIC_API_KEY; every AI fact must quote the document verbatim)</label>
        </Card>
        {error && <Notice tone="fail">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy || f.title.trim() === ""}>{busy ? "Reading…" : "Add and analyze"}</Button>
        </div>
      </form>
    </>
  );
}
