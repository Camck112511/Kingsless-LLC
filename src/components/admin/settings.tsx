"use client";
import { useRef, useState } from "react";
import { Button, Card, CardTitle, Field, Input, Notice, PageHeader } from "@/components/ui";
import { actions, useAppState } from "@/lib/store";
import type { Settings as S } from "@/engine/types";
import { NumberField } from "./fields";
import { LocationPicker } from "./location-picker";

export function Settings() {
  const state = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "pass" | "fail"; text: string } | null>(null);
  if (!state) return <p className="text-sm text-muted">Loading…</p>;
  const s = state.settings;
  const set = (p: Partial<S>) => actions.setSettings({ ...s, ...p });
  const setProfile = (p: Partial<S["profile"]>) => set({ profile: { ...s.profile, ...p } });
  const setContact = (p: Partial<S["contact"]>) => set({ contact: { ...s.contact, ...p } });

  function download() {
    const blob = new Blob([actions.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kingsless-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="These are the numbers and facts the engine judges every opportunity against. Be honest in the company profile: it is what stops the engine recommending work you cannot legally or financially take." />
      <div className="space-y-5">
        <Card>
          <CardTitle>Where you work</CardTitle>
          <LocationPicker area={s.serviceArea} onChange={(serviceArea) => set({ serviceArea })} />
        </Card>

        <Card>
          <CardTitle>Money rules</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Available capital" hint="Hard ceiling on cash at risk"><NumberField prefix="$" value={s.availableCapitalUsd} onChange={(v) => set({ availableCapitalUsd: v ?? 0 })} /></Field>
            <Field label="Walk-away margin" hint="Lowest net margin a bid may carry"><NumberField mode="rate" suffix="%" value={s.walkAwayMargin} onChange={(v) => set({ walkAwayMargin: Math.min(0.95, v ?? 0) })} /></Field>
            <Field label="Target margin" hint="What the target bid aims for"><NumberField mode="rate" suffix="%" value={s.targetMargin} onChange={(v) => set({ targetMargin: Math.min(0.95, v ?? 0) })} /></Field>
            <Field label="Minimum profit" hint="Dollar floor per job"><NumberField prefix="$" value={s.minProfitUsd} onChange={(v) => set({ minProfitUsd: v ?? 0 })} /></Field>
            <Field label="Overrun cushion" hint="% of sub price added as cost"><NumberField mode="rate" suffix="%" value={s.contingencyRate} onChange={(v) => set({ contingencyRate: Math.min(2, v ?? 0) })} /></Field>
            <Field label="Cost to prepare a bid"><NumberField prefix="$" value={s.bidPrepCostUsd} onChange={(v) => set({ bidPrepCostUsd: v ?? 0 })} /></Field>
            <Field label="Max days to first payment"><NumberField value={s.maxDaysToFirstPayment} onChange={(v) => set({ maxDaysToFirstPayment: v ?? 0 })} /></Field>
            <Field label="Max days to full payment"><NumberField value={s.maxDaysToFullPayment} onChange={(v) => set({ maxDaysToFullPayment: v ?? 0 })} /></Field>
            <Field label="Min days before due date"><NumberField value={s.minDaysToDeadline} onChange={(v) => set({ minDaysToDeadline: v ?? 0 })} /></Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Company profile (what you can really do today)</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="General-liability limit you hold"><NumberField prefix="$" value={s.profile.insuranceCoverageUsd} onChange={(v) => setProfile({ insuranceCoverageUsd: v ?? 0 })} /></Field>
            <Field label="Bonding capacity you hold"><NumberField prefix="$" value={s.profile.bondingCapacityUsd} onChange={(v) => setProfile({ bondingCapacityUsd: v ?? 0 })} /></Field>
            <Field label="Years in business"><NumberField value={s.profile.yearsInBusiness} onChange={(v) => setProfile({ yearsInBusiness: v ?? 0 })} /></Field>
            <Field label="Citable past projects"><NumberField value={s.profile.pastPerformanceCount} onChange={(v) => setProfile({ pastPerformanceCount: Math.floor(v ?? 0) })} /></Field>
            <Field label="Licenses you hold" hint="Comma separated" className="sm:col-span-2"><Input value={s.profile.licenses.join(", ")} onChange={(e) => setProfile({ licenses: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.profile.samRegistered} onChange={(e) => setProfile({ samRegistered: e.target.checked })} /> Active SAM.gov registration</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.profile.smallBusiness} onChange={(e) => setProfile({ smallBusiness: e.target.checked })} /> Qualifies as a small business</label>
            {(["8a", "sdvosb", "wosb", "hubzone"] as const).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="checkbox" checked={s.profile.certifications.includes(c)} onChange={(e) => setProfile({ certifications: e.target.checked ? [...s.profile.certifications, c] : s.profile.certifications.filter((x) => x !== c) })} /> {c.toUpperCase()} certified
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Signature on drafts</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Company"><Input value={s.contact.companyName} onChange={(e) => setContact({ companyName: e.target.value })} /></Field>
            <Field label="Your name"><Input value={s.contact.contactName} onChange={(e) => setContact({ contactName: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={s.contact.email} onChange={(e) => setContact({ email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={s.contact.phone} onChange={(e) => setContact({ phone: e.target.value })} /></Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Your data</CardTitle>
          <Notice tone="unknown" className="mb-4">
            Your pipeline, directory, quotes and settings are stored <strong>in this browser only</strong> (there is no database yet). Clearing site data or switching browsers loses them. Download a backup regularly.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={download}>Download backup</Button>
            <Button onClick={() => fileRef.current?.click()}>Restore from backup</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = actions.importJson(await f.text());
              setMsg(r.ok ? { tone: "pass", text: "Backup restored." } : { tone: "fail", text: r.error });
              e.target.value = "";
            }} />
            <Button variant="danger" onClick={() => { if (window.confirm("Erase the pipeline, directory, quotes and settings from this browser? Download a backup first if unsure.")) { actions.reset(); setMsg({ tone: "pass", text: "Everything cleared." }); } }}>Erase everything</Button>
          </div>
          {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
        </Card>
      </div>
    </>
  );
}
