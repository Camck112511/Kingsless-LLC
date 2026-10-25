"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ServiceCategory, SourceId } from "@/engine/types";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { extractApi, importUrlApi } from "@/lib/api";
import { blankIntake, buildOpportunity, type IntakeForm } from "@/lib/intake";
import { actions, useAppState } from "@/lib/store";

const SOURCES: Array<[SourceId, string]> = [
  ["manual", "Other / manual"], ["url-import", "A link I pasted"], ["sam.gov", "SAM.gov"], ["fort-worth-bonfire", "City of Fort Worth (Bonfire)"], ["lamp-texas", "LAMP Texas"], ["texas-esbd", "Texas SmartBuy (ESBD)"],
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
  const [link, setLink] = useState("");
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<{ tone: "pass" | "fail" | "unknown"; text: string } | null>(null);
  const set = (p: Partial<IntakeForm>) => setF((x) => ({ ...x, ...p }));

  async function readLink() {
    setReading(true);
    setReadMsg(null);
    const res = await importUrlApi(link.trim());
    setReading(false);
    if (!res.ok) return setReadMsg({ tone: "fail", text: res.error });
    const d = res.data;
    setF((x) => ({
      ...x,
      title: x.title || d.title.slice(0, 200),
      sourceUrl: d.finalUrl,
      solicitationNumber: x.solicitationNumber || d.hints.solicitationNumber,
      dueDate: x.dueDate || d.hints.dueDate || "",
    }));
    setText(d.text);
    setReadMsg({
      tone: "unknown",
      text: `Read ${d.text.length.toLocaleString()} characters${d.truncated ? " (long document, cut at the limit)" : ""}. Check the title, dates, place and category below: only what the page clearly states was filled in.${d.links.length ? ` The page links ${d.links.length} document(s), which are not read automatically: open the important ones and paste their text if they hold the terms.` : ""}`,
    });
  }

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
    const opp = buildOpportunity({ ...f, source: f.source === "manual" && link.trim() ? "url-import" : f.source, state: f.state || defaultState, scope: f.scope || text.slice(0, 600) }, terms);
    actions.addItems([opp]);
    router.push(`/admin/opportunities/${encodeURIComponent(opp.id)}`);
  }

  return (
    <>
      <PageHeader
        title="Add an opportunity"
        subtitle="For any listing you found yourself: read it from a link, or paste the text. The engine quotes the clauses it relies on, so always include the solicitation text."
      />
      <form onSubmit={submit} className="space-y-5">
        <Card>
          <Field label="Have a link? Read it for me" hint="A solicitation page or PDF on any public site. Pages that need a login, or that build themselves with JavaScript, cannot be read: paste the text below instead.">
            <div className="flex flex-wrap gap-2">
              <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="min-w-0 flex-1" aria-label="Link to read" />
              <Button type="button" disabled={reading || link.trim().length < 8} onClick={() => void readLink()}>{reading ? "Reading…" : "Read the link"}</Button>
            </div>
          </Field>
          {readMsg && <Notice tone={readMsg.tone} className="mt-3">{readMsg.text}</Notice>}
        </Card>
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
