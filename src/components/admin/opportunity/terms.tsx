"use client";
import { useState } from "react";
import type { Opportunity, ServiceCategory, SetAside, Terms, Tri } from "@/engine/types";
import { Button, Card, CardTitle, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { extractApi } from "@/lib/api";
import { actions } from "@/lib/store";
import { NumberField } from "../fields";

const TRI: Array<[Tri, string]> = [["unknown", "Unknown"], ["yes", "Yes"], ["no", "No"]];
const CATEGORIES: Array<[ServiceCategory, string]> = [
  ["unknown", "Unknown"], ["supply", "Supply / goods"], ["construction-general", "General construction"], ["construction-specialty", "Specialty trade"],
  ["security-guard", "Security guard services"], ["facility-services", "Facility services"], ["professional-services", "Professional services"], ["other-services", "Other services"],
];
const SET_ASIDES: Array<[SetAside, string]> = [
  ["unknown", "Unknown"], ["none", "None (open competition)"], ["small-business", "Small business"], ["8a", "8(a)"], ["sdvosb", "Service-disabled veteran"], ["wosb", "Women-owned"], ["hubzone", "HUBZone"],
];

export function TermsPanel({ opportunity }: { opportunity: Opportunity }) {
  const o = opportunity;
  const t = o.terms;
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "fail" | "pass"; lines: string[] } | null>(null);

  const setOpp = (patch: Partial<Opportunity>) => actions.updateItem(o.id, { opportunity: { ...o, ...patch } });
  const setTerms = (patch: Partial<Terms>) => setOpp({ terms: { ...t, ...patch } });

  async function read() {
    setBusy(true);
    setMsg(null);
    const res = await extractApi(text, useAi, t);
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "fail", lines: [res.error] });
    setOpp({ terms: res.data.terms });
    const lines = [`Rule reader filled: ${res.data.foundByRules.length ? res.data.foundByRules.join(", ") : "nothing it could prove"}.`];
    if (res.data.ai.requested) {
      lines.push(res.data.ai.used ? `AI (${res.data.ai.model}) added ${res.data.ai.accepted.length} fact(s); ${res.data.ai.rejected.length} rejected for lacking a verbatim quote.` : (res.data.ai.error ?? "AI was not used."));
      lines.push(...res.data.ai.conflicts);
    }
    lines.push("Values you set by hand are never overwritten. Check each against the document.");
    setMsg({ tone: "info", lines });
  }

  const triSelect = (key: "bidBond" | "performanceBond" | "paymentBond" | "insuranceRequired" | "licensingRequired" | "mandatoryPreBid" | "rapidTurnaround", label: string) => (
    <Field label={label}>
      <Select value={t[key]} onChange={(e) => setTerms({ [key]: e.target.value as Tri })}>
        {TRI.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </Field>
  );

  const evidence = Object.entries(t.evidence).filter(([, v]) => v && v.length > 0);

  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">Facts the verdict is built on</span>}>Solicitation facts</CardTitle>

      <div className="mb-5 rounded-xl border border-dashed border-line p-4">
        <Field label="Paste the solicitation text (or the clauses that matter)" hint="The reader quotes the sentence behind every fact it finds. It reports only what the text says.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste scope, instructions to offerors, payment and subcontracting clauses…" className="min-h-28" />
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={read} disabled={busy || text.trim().length < 20}>
            {busy ? "Reading…" : "Read text"}
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Also use the AI reader (needs ANTHROPIC_API_KEY)
          </label>
        </div>
        {msg && (
          <Notice tone={msg.tone} className="mt-3">
            {msg.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </Notice>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Subcontracting">
          <Select value={t.subcontracting} onChange={(e) => setTerms({ subcontracting: e.target.value as Terms["subcontracting"] })}>
            <option value="unknown">Unknown</option>
            <option value="allowed">Allowed</option>
            <option value="limited">Limited (cap / approval)</option>
            <option value="prohibited">Prohibited</option>
          </Select>
        </Field>
        <Field label="Max share to subs" hint="Only if a cap is stated">
          <NumberField mode="rate" suffix="%" value={t.subcontractShareCap} onChange={(v) => setTerms({ subcontractShareCap: v === null ? null : Math.min(1, v) })} />
        </Field>
        <Field label="Set-aside">
          <Select value={t.setAside} onChange={(e) => setTerms({ setAside: e.target.value as SetAside })}>
            {SET_ASIDES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={o.category} onChange={(e) => setOpp({ category: e.target.value as ServiceCategory })}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>

        <Field label="Payment structure">
          <Select value={t.paymentKind} onChange={(e) => setTerms({ paymentKind: e.target.value as Terms["paymentKind"] })}>
            <option value="unknown">Unknown</option>
            <option value="net-after-invoice">One invoice, net days</option>
            <option value="progress">Recurring invoices</option>
            <option value="milestone">Milestones</option>
            <option value="after-acceptance">After acceptance</option>
          </Select>
        </Field>
        <Field label="Net days"><NumberField value={t.paymentNetDays} onChange={(v) => setTerms({ paymentNetDays: v })} /></Field>
        <Field label="Invoice cycle (days)"><NumberField value={t.invoiceCycleDays} onChange={(v) => setTerms({ invoiceCycleDays: v })} /></Field>
        <Field label="Retainage"><NumberField mode="rate" suffix="%" value={t.retainageRate} onChange={(v) => setTerms({ retainageRate: v === null ? null : Math.min(1, v) })} /></Field>
        <Field label="Acceptance period (days)"><NumberField value={t.acceptanceDays} onChange={(v) => setTerms({ acceptanceDays: v })} /></Field>

        {triSelect("bidBond", "Bid bond")}
        {triSelect("performanceBond", "Performance bond")}
        {triSelect("paymentBond", "Payment bond")}
        {triSelect("insuranceRequired", "Insurance required")}
        <Field label="Insurance minimum limit"><NumberField prefix="$" value={t.insuranceMinLimitUsd} onChange={(v) => setTerms({ insuranceMinLimitUsd: v })} /></Field>
        {triSelect("licensingRequired", "Prime must be licensed")}
        <Field label="Past performance">
          <Select value={t.pastPerformance} onChange={(e) => setTerms({ pastPerformance: e.target.value as Terms["pastPerformance"] })}>
            <option value="unknown">Unknown</option>
            <option value="none">Not a factor</option>
            <option value="scored">Scored</option>
            <option value="required">Required</option>
          </Select>
        </Field>
        <Field label="Min years of experience"><NumberField value={t.minYearsExperience} onChange={(v) => setTerms({ minYearsExperience: v })} /></Field>
        {triSelect("mandatoryPreBid", "Mandatory pre-bid meeting")}
        <Field label="Pre-bid date"><Input type="date" value={t.preBidDate ?? ""} onChange={(e) => setTerms({ preBidDate: e.target.value || null })} /></Field>
        {triSelect("rapidTurnaround", "Rapid turnaround demanded")}
      </div>

      <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Title" className="sm:col-span-2"><Input value={o.title} onChange={(e) => setOpp({ title: e.target.value })} /></Field>
        <Field label="Solicitation number"><Input value={o.solicitationNumber} onChange={(e) => setOpp({ solicitationNumber: e.target.value })} /></Field>
        <Field label="Agency / owner"><Input value={o.agency} onChange={(e) => setOpp({ agency: e.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={o.dueDate?.slice(0, 10) ?? ""} onChange={(e) => setOpp({ dueDate: e.target.value || null })} /></Field>
        <Field label="Performance days"><NumberField value={o.durationDays} onChange={(v) => setOpp({ durationDays: v })} /></Field>
        <Field label="Stated value, low"><NumberField prefix="$" value={o.valueEstimate.low} onChange={(v) => setOpp({ valueEstimate: { ...o.valueEstimate, low: v } })} /></Field>
        <Field label="Stated value, high"><NumberField prefix="$" value={o.valueEstimate.high} onChange={(v) => setOpp({ valueEstimate: { ...o.valueEstimate, high: v } })} /></Field>
        <Field label="City"><Input value={o.location.city} onChange={(e) => setOpp({ location: { ...o.location, city: e.target.value } })} /></Field>
        <Field label="State"><Input value={o.location.state} maxLength={2} onChange={(e) => setOpp({ location: { ...o.location, state: e.target.value.toUpperCase() } })} /></Field>
        <Field label="Official link" className="sm:col-span-2"><Input value={o.sourceUrl} onChange={(e) => setOpp({ sourceUrl: e.target.value })} /></Field>
        <Field label="Scope" className="sm:col-span-2 lg:col-span-4"><Textarea value={o.scope} onChange={(e) => setOpp({ scope: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={o.provenance.verified}
            onChange={(e) => setOpp({ provenance: { ...o.provenance, verified: e.target.checked, checkedOn: e.target.checked ? new Date().toISOString().slice(0, 10) : null } })}
          />
          <span>
            <strong>I confirmed these facts against the official portal.</strong>
            <span className="block text-xs text-muted">Leave unchecked until you have. Unverified listings carry a warning on every analysis.</span>
          </span>
        </label>
      </div>

      {evidence.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">Evidence behind each fact ({evidence.length} fields)</summary>
          <dl className="mt-3 space-y-3">
            {evidence.map(([k, lines]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
                {(lines ?? []).map((l, i) => (
                  <dd key={i} className="mt-1 border-l-2 border-line pl-3 text-xs italic text-muted">{l}</dd>
                ))}
              </div>
            ))}
          </dl>
        </details>
      )}
    </Card>
  );
}
