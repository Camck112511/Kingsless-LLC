"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtDate, fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select } from "@/components/ui";
import { bidDownload } from "@/lib/api";
import { actions, useAppState, type PipelineItem } from "@/lib/store";

type Method = "own-email" | "portal" | "mail-or-hand";

/** A bid the engine finished but cannot send itself: one tap to get it out, one tap to say it went. */
function ReadyCard({ item }: { item: PipelineItem }) {
  const state = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [method, setMethod] = useState<Method>("own-email");
  const [ref, setRef] = useState("");
  if (!state) return null;
  const o = item.opportunity;
  const id = o.id;
  const auto = item.bid?.auto;
  const to = auto?.progress.recipient || auto?.auth.submissionEmail || "";
  const company = state.settings.contact.companyName || "Kingsless LLC";
  const subject = `Bid${o.solicitationNumber ? ` ${o.solicitationNumber}` : ""}: ${o.title} - ${company}`;
  const body = `Please find attached ${company}'s bid in response to ${o.solicitationNumber ? `solicitation ${o.solicitationNumber}` : "your solicitation"}, "${o.title}".\n\nPlease confirm receipt by reply.\n\nThank you,\n${state.settings.contact.contactName}\n${company}\n${state.settings.contact.phone}`;
  const link = safeUrl(o.sourceUrl);

  async function get(key: string, format: "pdf" | "eml") {
    setBusy(key);
    setError(null);
    const r = await bidDownload(state!, id, { format });
    setBusy(null);
    if (!r.ok) setError(r.error);
  }

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="font-medium">{o.title}</p>
          <p className="mt-0.5 text-xs text-muted">{o.agency || "Unknown agency"} · due {fmtDate(o.dueDate)} · price {fmtUsd(item.inputs.plannedBidUsd)}{to ? ` · goes to ${to}` : " · through the agency's portal"}</p>
        </div>
        <Badge tone="info">Ready to send</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {to ? (
          <>
            <Button variant="primary" disabled={busy !== null} onClick={() => void get("eml", "eml")}>{busy === "eml" ? "Preparing…" : "Email draft with the PDF attached (.eml)"}</Button>
            <a className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open my email app</a>
          </>
        ) : link ? (
          <a className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:opacity-90" href={link} target="_blank" rel="noopener noreferrer">Open the agency&apos;s page ↗</a>
        ) : null}
        <Button disabled={busy !== null} onClick={() => void get("pdf", "pdf")}>{busy === "pdf" ? "Preparing…" : "Download the PDF"}</Button>
        <Link className="text-xs text-accent underline" href={`/admin/opportunities/${encodeURIComponent(id)}/bid`}>Review in the workspace</Link>
      </div>
      {to && <p className="mt-2 text-xs text-muted">The .eml opens as a ready-to-send message in Outlook, Apple Mail and Thunderbird. In Gmail or on a phone, use “Open my email app” and attach the downloaded PDF.</p>}
      {error && <Notice tone="fail" className="mt-2">{error}</Notice>}
      <div className="mt-3 border-t border-line pt-3">
        {marking ? (
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <Field label="How did you send it?">
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="own-email">By email</option>
                <option value="portal">Through the portal</option>
                <option value="mail-or-hand">Mail or hand-delivered</option>
              </Select>
            </Field>
            <Field label="Confirmation or tracking number (optional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMarking(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => actions.recordSent(id, method, ref)}>Yes, I sent it</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setMarking(true)}>I sent it</Button>
        )}
      </div>
    </li>
  );
}

/** What needs the owner right now: bids ready to send, and bids waiting on something only they can supply. */
export function ActionQueue({ items }: { items: PipelineItem[] }) {
  const ready = items.filter((i) => i.bid?.auto?.progress.phase === "ready-to-upload");
  const needs = items.filter((i) => i.bid?.auto?.progress.phase === "needs-you");
  if (ready.length === 0 && needs.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardTitle aside={<Badge tone="unknown">{ready.length + needs.length} need you</Badge>}>Needs you</CardTitle>
      {ready.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Ready to send</p>
          <ul className="space-y-3">{ready.map((i) => <ReadyCard key={i.opportunity.id} item={i} />)}</ul>
        </div>
      )}
      {needs.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Waiting on you</p>
          <ul className="space-y-3">
            {needs.map((i) => (
              <li key={i.opportunity.id} className="rounded-xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium">{i.opportunity.title}</p>
                  <Link className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2" href={`/admin/opportunities/${encodeURIComponent(i.opportunity.id)}/bid`}>Open the workspace</Link>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{(i.bid?.auto?.progress.needs ?? []).map((n, k) => <li key={k}>{n}</li>)}</ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
