"use client";
import Link from "next/link";
import { useState } from "react";
import type { PreflightCheck, Settings } from "@/engine/types";
import { fmtDate, fmtPct, fmtUsd, safeUrl, todayIso } from "@/components/format";
import { Badge, Button, Field, Input, Notice, Select, Textarea, cn } from "@/components/ui";
import { bidDownload, bidSendApi, type BidPlan } from "@/lib/api";
import { actions, bidOf, type AppState, type PipelineItem } from "@/lib/store";
import type { Capabilities } from "@/server/views";
import { NumberField } from "../fields";
import { GatesPanel } from "../opportunity/gates";
import { ShortlistPanel } from "../opportunity/shortlist";
import { MarketPanel } from "../market";
import { DocPreview } from "./doc-preview";
import { SubResearchPanel } from "./sub-research";

export interface StepProps {
  state: AppState;
  item: PipelineItem;
  plan: BidPlan;
  caps: Capabilities;
}

const id = (p: StepProps) => p.item.opportunity.id;

/* ----------------------------------- 1 fit ----------------------------------- */

export function FitStep({ plan, item }: StepProps) {
  const r = plan.analysis.recommendation;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{r.headline}</p>
      <ul className="list-disc space-y-1 pl-5 text-muted">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p className="text-xs text-muted">
        Business fit {plan.analysis.fit.score}/100. See the breakdown and ask the AI for a second opinion on the{" "}
        <Link className="text-accent underline" href={`/admin/opportunities/${encodeURIComponent(item.opportunity.id)}`}>opportunity page</Link>.
      </p>
    </div>
  );
}

/* ---------------------------------- 2 prove ---------------------------------- */

export function ProveStep({ plan, item }: StepProps) {
  const a = plan.analysis;
  return (
    <div className="space-y-3">
      <p className="text-sm">{a.verdictReason}</p>
      <GatesPanel analysis={a} />
      {a.openQuestions.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 font-medium">Questions to answer</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">{a.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">
            Draft the procurement inquiry on the <Link className="text-accent underline" href={`/admin/opportunities/${encodeURIComponent(item.opportunity.id)}`}>opportunity page</Link> (scripts section). Nothing is ever sent for you.
          </p>
        </div>
      )}
      {!item.opportunity.provenance.verified && (
        <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={false} onChange={() => actions.updateItem(item.opportunity.id, { opportunity: { ...item.opportunity, provenance: { ...item.opportunity.provenance, verified: true, checkedOn: todayIso() } } })} />
          <span>
            <span className="font-medium">I checked this listing against the official solicitation.</span>
            <span className="block text-xs text-muted">Required before the console will send a bid. Tick it only after you read the official documents and the dates and terms here match them.</span>
          </span>
        </label>
      )}
    </div>
  );
}

/* --------------------------------- 3 quotes --------------------------------- */

export function QuotesStep(p: StepProps) {
  return (
    <div className="space-y-4">
      <ShortlistPanel item={p.item} analysis={p.plan.analysis} state={p.state} />
      <details className="rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Need more names? Research subcontractors with AI</summary>
        <div className="px-5 pb-5"><SubResearchPanel item={p.item} settings={p.state.settings} aiEnabled={p.caps.ai} /></div>
      </details>
    </div>
  );
}

/* ---------------------------------- 4 price ---------------------------------- */

export function PriceStep(p: StepProps) {
  const { plan, item } = p;
  const a = plan.analysis;
  const bid = bidOf(item);
  const oid = id(p);
  const setPrice = (v: number | null) => actions.updateItem(oid, { inputs: { ...item.inputs, plannedBidUsd: v } });
  const price = item.inputs.plannedBidUsd;
  const notes = a.prices.notes;
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line p-3"><dt className="text-xs text-muted">Expected market price</dt><dd className="text-lg font-semibold tabular-nums">{fmtUsd(a.marketPriceUsd)}</dd></div>
        <div className="rounded-xl border border-line p-3"><dt className="text-xs text-muted">Target bid</dt><dd className="text-lg font-semibold tabular-nums">{fmtUsd(a.prices.targetBidUsd)}</dd></div>
        <div className="rounded-xl border border-line p-3"><dt className="text-xs text-muted">Walk-away (lowest)</dt><dd className="text-lg font-semibold tabular-nums">{fmtUsd(a.prices.walkAwayPriceUsd)}</dd></div>
        <div className="rounded-xl border border-line p-3"><dt className="text-xs text-muted">Most you can pay the sub</dt><dd className="text-lg font-semibold tabular-nums">{fmtUsd(a.prices.maxSubPriceUsd)}</dd></div>
      </dl>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
        <Field label="Your bid price" hint="What you will actually submit">
          <NumberField prefix="$" aria-label="Your bid price" value={price} onChange={setPrice} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={a.prices.targetBidUsd === null} onClick={() => setPrice(a.prices.targetBidUsd)}>Use the target {a.prices.targetBidUsd !== null ? fmtUsd(a.prices.targetBidUsd) : ""}</Button>
          <Button disabled={a.prices.walkAwayPriceUsd === null} onClick={() => setPrice(a.prices.walkAwayPriceUsd)}>Use the lowest {a.prices.walkAwayPriceUsd !== null ? fmtUsd(a.prices.walkAwayPriceUsd) : ""}</Button>
        </div>
      </div>
      {a.pricing && price !== null && (
        <p className="rounded-xl bg-surface-2 px-4 py-3">
          At {fmtUsd(price)}: profit about <strong>{fmtUsd(a.pricing.profitBeforeTaxUsd)}</strong> before tax ({fmtPct(a.pricing.netMarginRate, 1)} margin), win chance about <strong>{fmtPct(a.winProbability.value)}</strong>. Lower wins more often but earns less.
        </p>
      )}
      {price !== null && a.prices.walkAwayPriceUsd !== null && price < a.prices.walkAwayPriceUsd && <Notice tone="fail">This is below your walk-away price. At this price the bid breaks your own margin rule.</Notice>}
      {notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <Field label="Keep the offer open for (days after the due date)">
        <NumberField value={bid.prep.validityDays} onChange={(v) => actions.patchBid(oid, (b) => ({ ...b, prep: { ...b.prep, validityDays: Math.max(1, Math.floor(v ?? 90)) } }))} />
      </Field>
      <details className="rounded-xl border border-line">
        <summary className="cursor-pointer px-4 py-3 font-medium">What have similar jobs paid? (federal records)</summary>
        <div className="px-4 pb-4">
          <MarketPanel
            settings={p.state.settings}
            initial={{ keywords: item.opportunity.title.toLowerCase().match(/[a-z]{5,}/g)?.slice(0, 3) ?? [], naics: item.opportunity.naics ? [item.opportunity.naics] : [], state: item.opportunity.location.state.length === 2 ? item.opportunity.location.state.toUpperCase() : "" }}
            onUseMedian={(usd) => actions.updateItem(oid, { inputs: { ...item.inputs, marketPriceUsd: usd } })}
          />
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------- 5 docs ----------------------------------- */

const CONTACT_FIELDS: Array<[keyof Settings["contact"], string, string?]> = [
  ["companyName", "Company legal name"],
  ["contactName", "Your name (signs the bid)"],
  ["title", "Your title", "e.g. Owner"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["address", "Mailing address"],
  ["uei", "SAM.gov UEI", "if registered"],
  ["cage", "CAGE code", "if registered"],
];

export function DocsStep(p: StepProps) {
  const { state, item, plan } = p;
  const oid = id(p);
  const c = state.settings.contact;
  const bid = bidOf(item);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setContact = (patch: Partial<Settings["contact"]>) => actions.setSettings({ ...state.settings, contact: { ...c, ...patch } });

  async function download(key: string, what: { format: "docx" | "pdf" | "zip"; doc?: string }) {
    setBusy(key);
    setError(null);
    const r = await bidDownload(state, oid, what);
    setBusy(null);
    if (!r.ok) setError(r.error);
  }

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-semibold">Your company details (saved in Settings, reused on every bid)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTACT_FIELDS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <Input value={c[k] ?? ""} onChange={(e) => setContact({ [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="About the company" hint="Two or three sentences for the qualifications page" className="sm:col-span-2 lg:col-span-3">
            <Textarea className="min-h-20" value={c.capability ?? ""} onChange={(e) => setContact({ capability: e.target.value })} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold">How you will do the work</h3>
        <p className="mb-2 text-xs text-muted">Leave this blank to use the console&apos;s draft for this kind of work, or write your own (blank line between paragraphs). Do not promise what you cannot deliver.</p>
        <Textarea
          className="min-h-28"
          aria-label="Technical approach"
          value={bid.prep.approach}
          onChange={(e) => actions.patchBid(oid, (b) => ({ ...b, prep: { ...b.prep, approach: e.target.value } }))}
          placeholder="(using the console's draft)"
        />
      </section>

      {plan.placeholders.length > 0 ? (
        <Notice tone="unknown">
          <strong>{plan.placeholders.length} blank{plan.placeholders.length === 1 ? "" : "s"} left:</strong> {plan.placeholders.join("; ")}. They show highlighted in the documents below. Fill them here, or edit the Word files.
        </Notice>
      ) : (
        <Notice tone="pass">No blanks left in the documents that go to the agency.</Notice>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">The documents</h3>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy !== null} onClick={() => void download("zip", { format: "zip" })}>{busy === "zip" ? "Preparing…" : "Download everything (.zip)"}</Button>
            <Button disabled={busy !== null} onClick={() => void download("pdf", { format: "pdf" })}>{busy === "pdf" ? "Preparing…" : "Download the PDF packet"}</Button>
          </div>
        </div>
        {error && <Notice tone="fail" className="mb-2">{error}</Notice>}
        <ul className="space-y-2">
          {plan.documents.map((d) => (
            <li key={d.id} className="rounded-xl border border-line">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0">
                    <span className="font-medium">{d.title}</span>{" "}
                    <Badge tone={d.audience === "agency" ? "info" : d.audience === "subcontractor" ? "accent" : "neutral"}>{d.audience === "agency" ? "Goes to the agency" : d.audience === "subcontractor" ? "For your subcontractor" : "Private: stays with you"}</Badge>
                    <span className="mt-0.5 block text-xs text-muted">{d.purpose}</span>
                  </span>
                </summary>
                <div className="space-y-3 px-4 pb-4">
                  <DocPreview doc={d} />
                  <Button disabled={busy !== null} onClick={() => void download(d.id, { format: "docx", doc: d.id })}>{busy === d.id ? "Preparing…" : "Download as Word (.docx)"}</Button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ----------------------------------- 6 check ---------------------------------- */

export function CheckList({ checks }: { checks: PreflightCheck[] }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line text-sm">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
          <span className={cn("mt-0.5 w-5 text-center font-semibold", c.ok ? "text-pass" : c.blocking ? "text-fail" : "text-unknown")} aria-label={c.ok ? "Passed" : "Not passed"}>{c.ok ? "✓" : c.blocking ? "✕" : "!"}</span>
          <div className="min-w-0"><p className="font-medium">{c.label}</p><p className="text-xs text-muted">{c.detail}</p></div>
        </li>
      ))}
    </ul>
  );
}

export function CheckStep(p: StepProps) {
  const { plan, item } = p;
  const oid = id(p);
  const bid = bidOf(item);
  // Read from the local record, not the server round trip, so the box ticks the instant it is clicked.
  const reviewed = bid.prep.reviewedDigest !== "" && bid.prep.reviewedDigest === plan.digest;
  return (
    <div className="space-y-4 text-sm">
      <CheckList checks={plan.checks.portal} />
      <div className="rounded-xl border border-line p-4">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => actions.patchBid(oid, (b) => ({ ...b, prep: { ...b.prep, reviewedDigest: e.target.checked ? plan.digest : "" } }))} />
          <span>
            <span className="font-medium">I read every document that goes to the agency, and I take responsibility for what it says.</span>
            <span className="block text-xs text-muted">If you change the price, your company details or the wording afterward, this resets and you read again.</span>
          </span>
        </label>
      </div>
      {bid.submission === null && plan.checks.portal.some((c) => !c.ok && c.id === "quote") && (
        <Notice tone="unknown">There is no firm subcontractor quote yet. You can still submit through the portal yourself, but the console will not email a bid until one exists, because a price without a real quote behind it can lose you money.</Notice>
      )}
    </div>
  );
}

/* ---------------------------------- 7 submit ---------------------------------- */

type Method = "console-email" | "portal" | "own-email" | "mail-or-hand";

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function SubmitStep(p: StepProps) {
  const { state, item, plan, caps } = p;
  const oid = id(p);
  const o = item.opportunity;
  const bid = bidOf(item);
  const company = state.settings.contact.companyName || "Kingsless LLC";
  const [method, setMethod] = useState<Method>("portal");
  const [subject, setSubject] = useState(`Bid: ${o.solicitationNumber || o.title} ${o.solicitationNumber ? `- ${o.title}` : ""} - ${company}`.replace(/\s+/g, " ").trim());
  const [message, setMessage] = useState(
    `Please find attached ${company}'s bid in response to ${o.solicitationNumber ? `solicitation ${o.solicitationNumber}` : "your solicitation"}, "${o.title}".\n\nPlease confirm receipt by reply.\n\nThank you,\n${state.settings.contact.contactName}\n${company}\n${state.settings.contact.phone}`,
  );
  const [files, setFiles] = useState<Array<{ filename: string; contentBase64: string; size: number }>>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rec, setRec] = useState({ date: todayIso(), confirmation: "", note: "" });
  const recipient = bid.prep.submissionEmail;
  const setRecipient = (v: string) => actions.patchBid(oid, (b) => ({ ...b, prep: { ...b.prep, submissionEmail: v } }));

  const record = (m: Method, confirmation: string, note: string, date: string) => {
    actions.patchBid(oid, (b) => ({ ...b, submission: { submittedOn: date, method: m, confirmation, priceUsd: item.inputs.plannedBidUsd, note } }));
    actions.updateItem(oid, { status: "bid-submitted" });
  };

  if (bid.submission) {
    const s = bid.submission;
    return (
      <div className="space-y-3 text-sm">
        <Notice tone="pass">
          Submitted <strong>{fmtDate(s.submittedOn)}</strong> ({s.method.replace(/-/g, " ")}){s.confirmation ? `. Confirmation: ${s.confirmation}` : ""}{s.priceUsd !== null ? `. Price ${fmtUsd(s.priceUsd)}` : ""}.
        </Notice>
        {s.note && <p className="text-muted">{s.note}</p>}
        <Button variant="ghost" onClick={() => { if (window.confirm("Mark this bid as NOT submitted? This only changes your record.")) { actions.patchBid(oid, (b) => ({ ...b, submission: null })); actions.updateItem(oid, { status: "approved" }); } }}>Undo: it was not submitted</Button>
      </div>
    );
  }

  async function addFiles(list: FileList | null) {
    setFileError(null);
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 4) return setFileError("Up to 4 extra files.");
      if (next.reduce((s, x) => s + x.size, 0) + f.size > 3_000_000) return setFileError("Extra files can total 3 MB. Upload larger ones through the portal.");
      next.push({ filename: f.name, contentBase64: await toBase64(f), size: f.size });
    }
    setFiles(next);
  }

  async function send() {
    setBusy(true);
    setError(null);
    const r = await bidSendApi(state, oid, { to: recipient.trim(), subject, message, attachments: files.map(({ filename, contentBase64 }) => ({ filename, contentBase64 })) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    record("console-email", r.data.id, `Emailed to ${r.data.to} with ${r.data.attachments.join(", ")}.`, todayIso());
  }

  const emailChecks = plan.checks.email;
  const blockers = emailChecks.filter((c) => c.blocking && !c.ok);
  const METHODS: Array<[Method, string, string]> = [
    ["console-email", "Email it from here", "The agency's solicitation says to email bids."],
    ["portal", "Upload it to the agency's portal", "Most city, county and state bids work this way."],
    ["own-email", "I'll email it myself", "Use your own email program."],
    ["mail-or-hand", "Mail or hand-deliver", "Print the PDF packet and sign it."],
  ];

  return (
    <div className="space-y-4 text-sm">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 font-medium">How does the solicitation say to submit?</legend>
        {METHODS.map(([m, label, hint]) => (
          <label key={m} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-3", method === m ? "border-accent bg-accent-soft" : "border-line")}>
            <input type="radio" name="method" className="mt-1" checked={method === m} onChange={() => setMethod(m)} />
            <span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
          </label>
        ))}
      </fieldset>

      {method === "console-email" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          {!caps.email && <Notice tone="unknown">Email sending is not set up on the server (needs <code>RESEND_API_KEY</code> and <code>BID_EMAIL_FROM</code>). Use another method, or ask your developer to add them.</Notice>}
          <Field label="Send to" hint="The exact address in the solicitation's instructions">
            <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="bids@agency.gov" />
          </Field>
          <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={250} /></Field>
          <Field label="Message"><Textarea className="min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <div>
            <p className="mb-1 font-medium">Also attach (optional)</p>
            <p className="mb-2 text-xs text-muted">The PDF packet is attached automatically. Add things like your certificate of insurance or a signed form. Up to 4 files, 3 MB in total.</p>
            <input type="file" multiple aria-label="Extra attachments" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} className="text-xs" />
            {fileError && <p className="mt-1 text-xs text-fail">{fileError}</p>}
            {files.length > 0 && <ul className="mt-2 space-y-1 text-xs">{files.map((f) => <li key={f.filename} className="flex items-center gap-2">{f.filename} <span className="text-muted">({Math.ceil(f.size / 1000)} KB)</span><button type="button" className="text-fail underline" onClick={() => setFiles(files.filter((x) => x !== f))}>remove</button></li>)}</ul>}
          </div>
          <CheckList checks={emailChecks} />
          {blockers.length > 0 ? (
            <Notice tone="fail">Nothing can be sent yet: {blockers.map((b) => b.label.toLowerCase()).join("; ")}.</Notice>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Type SEND to confirm" hint="This emails the bid to the agency. It cannot be unsent."><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
              <Button variant="primary" disabled={busy || typed !== "SEND"} onClick={() => void send()} className="h-10">{busy ? "Sending…" : "Send the bid"}</Button>
            </div>
          )}
          {error && <Notice tone="fail">{error}</Notice>}
        </div>
      )}

      {method === "portal" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p>Agency portals do not let other software submit for you, so you upload the files yourself. Everything is ready:</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Download the PDF packet (or the Word files if the portal wants them separately) from the documents step.</li>
            <li>{safeUrl(o.sourceUrl) ? <a className="text-accent underline" href={safeUrl(o.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Open the agency&apos;s listing ↗</a> : "Open the agency's portal."} Sign in or register as a vendor if it asks.</li>
            <li>Upload each file where the portal asks, and fill in any forms it requires.</li>
            <li>Submit, then save the confirmation number or receipt.</li>
          </ol>
          <RecordForm rec={rec} setRec={setRec} onRecord={() => record("portal", rec.confirmation, rec.note, rec.date)} />
        </div>
      )}

      {method === "own-email" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-muted">Download the PDF packet, then write your email. This button opens your email program with the subject and message filled in; attach the PDF yourself.</p>
          <a className="inline-block rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>Open my email program</a>
          <Field label="Send to"><Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="bids@agency.gov" /></Field>
          <RecordForm rec={rec} setRec={setRec} onRecord={() => record("own-email", rec.confirmation, rec.note, rec.date)} />
        </div>
      )}

      {method === "mail-or-hand" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-muted">Print the PDF packet, sign where marked, and deliver it exactly as the solicitation says (sealed envelope, copies, label). Get a receipt or tracking number.</p>
          <RecordForm rec={rec} setRec={setRec} onRecord={() => record("mail-or-hand", rec.confirmation, rec.note, rec.date)} />
        </div>
      )}
    </div>
  );
}

function RecordForm({ rec, setRec, onRecord }: { rec: { date: string; confirmation: string; note: string }; setRec: (r: { date: string; confirmation: string; note: string }) => void; onRecord: () => void }) {
  return (
    <div className="border-t border-line pt-3">
      <p className="mb-2 font-medium">After you submit, record it here</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date submitted"><Input type="date" value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} /></Field>
        <Field label="Confirmation or tracking number"><Input value={rec.confirmation} onChange={(e) => setRec({ ...rec, confirmation: e.target.value })} /></Field>
        <Field label="Note"><Input value={rec.note} onChange={(e) => setRec({ ...rec, note: e.target.value })} /></Field>
      </div>
      <Button className="mt-3" variant="primary" disabled={!rec.date} onClick={onRecord}>I submitted it: record it</Button>
    </div>
  );
}

/* ----------------------------------- 8 result ---------------------------------- */

export function ResultStep(p: StepProps) {
  const { item } = p;
  const oid = id(p);
  const bid = bidOf(item);
  const [f, setF] = useState<{ result: "won" | "lost" | "no-award" | "withdrawn"; decidedOn: string; awardUsd: number | null; note: string }>({ result: "won", decidedOn: todayIso(), awardUsd: item.inputs.plannedBidUsd, note: "" });
  if (bid.outcome) {
    const r = bid.outcome;
    return (
      <div className="space-y-3 text-sm">
        <Notice tone={r.result === "won" ? "pass" : "neutral"}>
          <strong>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : r.result === "no-award" ? "No award made" : "Withdrawn"}</strong> on {fmtDate(r.decidedOn)}{r.awardUsd !== null && r.result === "won" ? `, ${fmtUsd(r.awardUsd)}` : ""}.{r.note ? ` ${r.note}` : ""}
        </Notice>
        <Button variant="ghost" onClick={() => { if (window.confirm("Clear the recorded result?")) { actions.patchBid(oid, (b) => ({ ...b, outcome: null })); actions.updateItem(oid, { status: "bid-submitted" }); } }}>Clear the result</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Result">
          <Select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value as typeof f.result })}>
            <option value="won">We won</option><option value="lost">We lost</option><option value="no-award">No award made</option><option value="withdrawn">We withdrew</option>
          </Select>
        </Field>
        <Field label="Date decided"><Input type="date" value={f.decidedOn} onChange={(e) => setF({ ...f, decidedOn: e.target.value })} /></Field>
        <Field label="Awarded amount"><NumberField prefix="$" value={f.awardUsd} onChange={(v) => setF({ ...f, awardUsd: v })} /></Field>
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Who won, at what price…" /></Field>
      </div>
      <Button variant="primary" disabled={!f.decidedOn} onClick={() => { actions.patchBid(oid, (b) => ({ ...b, outcome: { ...f, awardUsd: f.result === "won" ? f.awardUsd : f.awardUsd } })); actions.updateItem(oid, { status: f.result === "won" ? "won" : f.result === "lost" ? "lost" : "passed" }); }}>Record the result</Button>
    </div>
  );
}

/* ------------------------------------ 9 win ------------------------------------ */

export function WinStep(p: StepProps) {
  const { state, item, plan, caps } = p;
  const oid = id(p);
  const term = plan.documents.find((d) => d.id === "subcontract-term-sheet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const best = plan.analysis.candidates[0];
  return (
    <div className="space-y-5 text-sm">
      <ol className="list-decimal space-y-2 pl-5">
        <li><strong>Get the award in writing</strong> and note the notice-to-proceed date. <span className="text-muted">Do not commit your subcontractor to a start date until you have it.</span></li>
        <li><strong>Choose the subcontractor.</strong> {best ? <>Best match so far: <strong>{best.name}</strong> ({best.label.replace("-", " ")}).</> : "Research candidates below."} <span className="text-muted">Call at least two and compare in writing.</span></li>
        <li><strong>Send them the term sheet</strong> and agree the price, schedule and payment terms. <span className="text-muted">It never shows what the agency pays you.</span></li>
        <li><strong>Collect their paperwork:</strong> license, certificate of insurance naming you, and a W-9. <span className="text-muted">The agency may ask to see them.</span></li>
        <li><strong>Sign the full subcontract</strong> (have a lawyer review it) <em>before</em> anyone mobilizes.</li>
        <li><strong>Set up invoicing</strong> so you invoice the agency on the contract&apos;s schedule and pay the subcontractor on the agreed terms.</li>
      </ol>
      {term && (
        <div className="rounded-xl border border-line p-4">
          <p className="mb-2 font-medium">Term sheet for your subcontractor</p>
          <DocPreview doc={term} className="mb-3 max-h-80 overflow-y-auto" />
          <Button disabled={busy} onClick={async () => { setBusy(true); setError(null); const r = await bidDownload(state, oid, { format: "docx", doc: term.id }); setBusy(false); if (!r.ok) setError(r.error); }}>{busy ? "Preparing…" : "Download the term sheet (.docx)"}</Button>
          {error && <Notice tone="fail" className="mt-2">{error}</Notice>}
        </div>
      )}
      <ShortlistPanel item={item} analysis={plan.analysis} state={state} />
      <div className="rounded-xl border border-line p-4">
        <p className="mb-3 font-medium">Find more subcontractors</p>
        <SubResearchPanel item={item} settings={state.settings} aiEnabled={caps.ai} />
        <div className="mt-5">
          <MarketPanel settings={state.settings} initial={{ keywords: item.opportunity.title.toLowerCase().match(/[a-z]{5,}/g)?.slice(0, 3) ?? [], naics: item.opportunity.naics ? [item.opportunity.naics] : [], state: item.opportunity.location.state.length === 2 ? item.opportunity.location.state.toUpperCase() : "" }} />
        </div>
      </div>
    </div>
  );
}
