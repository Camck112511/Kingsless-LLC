"use client";
import { useState } from "react";
import type { Subcontractor, Tri } from "@/engine/types";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { blankSub } from "@/lib/intake";
import { actions, useAppState } from "@/lib/store";
import { NumberField } from "./fields";

const csv = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);

export function Subcontractors() {
  const state = useAppState();
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  if (!state) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Subcontractor directory"
        subtitle="Companies you might hire. A listing here is not proof they will take the work: the engine labels each one verified, partially verified or unverified per job, from the evidence you record."
        actions={<Button variant="primary" onClick={() => setEditing(blankSub())}>Add subcontractor</Button>}
      />
      {editing && <SubForm sub={editing} onDone={() => setEditing(null)} />}
      {state.subcontractors.length === 0 && !editing && <Notice tone="neutral">No subcontractors yet. Add the companies you are considering, then record what you have actually confirmed with each.</Notice>}
      <ul className="space-y-3">
        {state.subcontractors.map((s) => (
          <li key={s.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{s.name || "Unnamed"}</p>
                <p className="text-xs text-muted">{s.contact || "no contact recorded"} · serves {s.coverage.join(", ") || "—"} · {s.services.join(", ") || "no services listed"}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(structuredClone(s))}>Edit</Button>
                <Button variant="danger" onClick={() => { if (window.confirm(`Remove ${s.name || "this subcontractor"} and their quotes?`)) actions.removeSub(s.id); }}>Remove</Button>
              </div>
            </div>
            <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Badge tone={s.willingToSubcontract === "yes" ? "pass" : "neutral"}>Willing to subcontract: {s.willingToSubcontract}</Badge>
              <Badge tone={s.capacityConfirmed ? "pass" : "neutral"}>Capacity {s.capacityConfirmed ? "confirmed" : "unconfirmed"}</Badge>
              <Badge tone={s.insuranceCertOnFile ? "pass" : "neutral"}>Insurance cert {s.insuranceCertOnFile ? "on file" : "not on file"}</Badge>
              <Badge>{s.licenses.filter((l) => l.verifiedOn).length}/{s.licenses.length} licenses verified</Badge>
              <Badge>{s.similarProjects.length} similar project(s)</Badge>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function SubForm({ sub, onDone }: { sub: Subcontractor; onDone: () => void }) {
  const [s, setS] = useState<Subcontractor>(sub);
  const set = (p: Partial<Subcontractor>) => setS((x) => ({ ...x, ...p }));
  return (
    <Card className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Company name *"><Input value={s.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Contact"><Input value={s.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="name, phone, email" /></Field>
        <Field label="Services" hint="Comma separated keywords, e.g. grading, clearing"><Input value={s.services.join(", ")} onChange={(e) => set({ services: csv(e.target.value) })} /></Field>
        <Field label="Areas served" hint="States or cities, e.g. TX, Houston"><Input value={s.coverage.join(", ")} onChange={(e) => set({ coverage: csv(e.target.value) })} /></Field>
        <Field label="Insurance limit"><NumberField prefix="$" value={s.insuranceCoverageUsd} onChange={(v) => set({ insuranceCoverageUsd: v })} /></Field>
        <Field label="Bonding capacity"><NumberField prefix="$" value={s.bondingCapacityUsd} onChange={(v) => set({ bondingCapacityUsd: v })} /></Field>
        <Field label="Willing to subcontract under your agreement">
          <Select value={s.willingToSubcontract} onChange={(e) => set({ willingToSubcontract: e.target.value as Tri })}>
            <option value="unknown">Not confirmed</option><option value="yes">Yes, confirmed</option><option value="no">No</option>
          </Select>
        </Field>
        <Field label="Certifications"><Input value={s.certifications.join(", ")} onChange={(e) => set({ certifications: csv(e.target.value) })} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.insuranceCertOnFile} onChange={(e) => set({ insuranceCertOnFile: e.target.checked })} /> Insurance certificate on file</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.capacityConfirmed} onChange={(e) => set({ capacityConfirmed: e.target.checked })} /> They confirmed capacity for the dates</label>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Licenses</h3>
          {s.licenses.map((l, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input aria-label="License" value={l.name} placeholder="License and number" onChange={(e) => set({ licenses: s.licenses.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input aria-label="Verified on" type="date" title="Date you verified it with the issuing authority" value={l.verifiedOn ?? ""} onChange={(e) => set({ licenses: s.licenses.map((x, j) => (j === i ? { ...x, verifiedOn: e.target.value || null } : x)) })} className="w-40" />
              <Button variant="ghost" onClick={() => set({ licenses: s.licenses.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => set({ licenses: [...s.licenses, { name: "", verifiedOn: null }] })}>Add license</Button>
          <p className="mt-1 text-xs text-muted">Only dates you filled in count as verified.</p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Similar completed projects</h3>
          {s.similarProjects.map((p, i) => (
            <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
              <Input aria-label="Project" className="min-w-40 flex-1" value={p.description} placeholder="What and for whom" onChange={(e) => set({ similarProjects: s.similarProjects.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.referenceVerified} onChange={(e) => set({ similarProjects: s.similarProjects.map((x, j) => (j === i ? { ...x, referenceVerified: e.target.checked } : x)) })} /> reference checked</label>
              <Button variant="ghost" onClick={() => set({ similarProjects: s.similarProjects.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => set({ similarProjects: [...s.similarProjects, { description: "", year: null, referenceVerified: false }] })}>Add project</Button>
        </div>
      </div>
      <Field label="Notes" className="mt-4"><Textarea value={s.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={s.name.trim() === ""} onClick={() => { actions.upsertSub({ ...s, name: s.name.trim() }); onDone(); }}>Save</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}
