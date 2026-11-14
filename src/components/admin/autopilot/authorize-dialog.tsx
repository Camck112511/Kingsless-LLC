"use client";
import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/engine/types";
import { fmtDate, fmtUsd } from "@/components/format";
import { Badge, Button, Field, Input, Notice } from "@/components/ui";
import { actions, useAppState } from "@/lib/store";
import { NumberField } from "../fields";
import { VerdictBadge } from "../verdict";

/**
 * The one place the owner hands the engine permission to act on its own. It states plainly what will and will not happen,
 * makes the owner confirm they read each official solicitation, and requires typing AUTHORIZE. Nothing the engine does
 * later goes beyond the limits set here.
 */
export function AuthorizeDialog({ ids, analyses, onClose }: { ids: string[]; analyses: Record<string, Analysis | undefined>; onClose: (authorized: number) => void }) {
  const state = useAppState();
  const ref = useRef<HTMLDialogElement>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const [estimateOnly, setEstimateOnly] = useState(true);
  const [email, setEmail] = useState("");
  const [attested, setAttested] = useState(false);
  const [typed, setTyped] = useState("");
  const [estimates, setEstimates] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  if (!state) return null;
  const items = ids.map((id) => state.items.find((i) => i.opportunity.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
  const eligible = items.filter((i) => analyses[i.opportunity.id]?.verdict !== "reject");
  const rejected = items.filter((i) => analyses[i.opportunity.id]?.verdict === "reject");
  const needsEstimate = eligible.filter((i) => {
    const a = analyses[i.opportunity.id];
    return i.inputs.subPriceEstimateUsd === null && a?.subPriceBasis !== "firm-quote";
  });
  const missingEstimate = estimateOnlyNeedsInput(needsEstimate, estimates);
  const canGo = eligible.length > 0 && attested && typed === "AUTHORIZE" && !missingEstimate;

  function go() {
    const subEstimates: Record<string, number> = {};
    for (const [id, v] of Object.entries(estimates)) if (v !== null && v > 0) subEstimates[id] = v;
    const n = actions.authorizeBids(eligible.map((i) => i.opportunity.id), { attested, allowEstimateOnly: estimateOnly, floorUsd: floor, ceilingUsd: ceiling, submissionEmail: email, subEstimates });
    ref.current?.close();
    onClose(n);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="auth-title"
      onClose={() => onClose(0)}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-w-none rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink backdrop:bg-black/70"
    >
      <div className="max-h-[85dvh] space-y-4 overflow-y-auto p-5">
        <div>
          <h2 id="auth-title" className="text-lg font-semibold tracking-tight">Let the engine go after {items.length === 1 ? "this bid" : `these ${items.length} bids`}</h2>
          <p className="mt-1 text-sm text-muted">You pick the bids and the limits. The engine does the rest and tells you what happens.</p>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <p className="mb-1 font-semibold text-pass">It will</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Read each official solicitation and fill in what it can prove</li>
              <li>Choose the bid price that best balances winning and profit, inside your limits</li>
              <li>Write the bid documents and check every rule</li>
              <li>Email the bid if the listing says to (otherwise get it ready for you to upload)</li>
              <li>Watch for the result; if you win, tell you and rank who to sell it to</li>
            </ul>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="mb-1 font-semibold text-fail">It will never</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Bid when a rule fails or cannot be proven</li>
              <li>Go below your walk-away price or outside your limits</li>
              <li>Send anything to a subcontractor, or to anyone but the agency and you</li>
              <li>Send more than 5 bids a day</li>
              <li>Invent a fact: a blank in the documents stops it and asks you</li>
            </ul>
          </div>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {items.map((i) => {
            const a = analyses[i.opportunity.id];
            const bad = a?.verdict === "reject";
            return (
              <li key={i.opportunity.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{i.opportunity.title}</p>
                  <p className="text-xs text-muted">{i.opportunity.agency || "unknown agency"} · due {fmtDate(i.opportunity.dueDate)}{a?.prices.walkAwayPriceUsd != null ? ` · walk-away ${fmtUsd(a.prices.walkAwayPriceUsd)}` : ""}</p>
                </div>
                {a ? <VerdictBadge verdict={a.verdict} /> : <Badge>checking…</Badge>}
                {bad && <p className="w-full text-xs text-fail">Rejected under your rules, so it is left out.</p>}
              </li>
            );
          })}
        </ul>
        {rejected.length > 0 && eligible.length === 0 && <Notice tone="fail">Every bid selected is rejected under your rules. There is nothing to authorize.</Notice>}

        {needsEstimate.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-sm font-medium">What would a subcontractor charge? (needed to price these)</p>
            <div className="space-y-2">
              {needsEstimate.map((i) => (
                <Field key={i.opportunity.id} label={i.opportunity.title} hint="Your best estimate. The engine tests it with a 25% cushion and refuses if the job only works at the optimistic number.">
                  <NumberField prefix="$" aria-label={`Sub price estimate for ${i.opportunity.title}`} value={estimates[i.opportunity.id] ?? null} onChange={(v) => setEstimates((e) => ({ ...e, [i.opportunity.id]: v }))} />
                </Field>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Never bid below" hint="Blank = your walk-away price (the engine never goes lower anyway)"><NumberField prefix="$" aria-label="Never bid below" value={floor} onChange={setFloor} /></Field>
          <Field label="Never bid above" hint="Blank = the expected market price"><NumberField prefix="$" aria-label="Never bid above" value={ceiling} onChange={setCeiling} /></Field>
        </div>
        <Field label="Where to email bids if a listing does not say (optional)" hint="Leave blank and it only emails an address the listing clearly states.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bids@agency.gov" />
        </Field>

        <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={estimateOnly} onChange={(e) => setEstimateOnly(e.target.checked)} />
          <span>
            <span className="font-medium">Bid on my estimate if no subcontractor has quoted yet.</span>
            <span className="block text-xs text-muted">Needs at least 2 subcontractors on file who offer this work in the area (and list the license if one is required), and every rule to pass even if the sub costs 25% more. If a sub then charges more than you planned after a win, the LLC still owes the contract. Untick to wait for a firm quote.</span>
          </span>
        </label>

        <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          <span>
            <span className="font-medium">I read the official solicitation for each bid above, and the facts shown here match it.</span>
            <span className="block text-xs text-muted">This replaces the “confirm the listing” step. The engine re-reads the official page and stops if it disagrees.</span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Type AUTHORIZE to confirm" hint="A submitted bid is a commitment of the LLC. You can pause or stop any bid before it is sent."><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => ref.current?.close()}>Cancel</Button>
            <Button variant="primary" disabled={!canGo} onClick={go}>Authorize {eligible.length} bid{eligible.length === 1 ? "" : "s"}</Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function estimateOnlyNeedsInput(needs: Array<{ opportunity: { id: string } }>, estimates: Record<string, number | null>): boolean {
  return needs.some((i) => !(estimates[i.opportunity.id] && (estimates[i.opportunity.id] as number) > 0));
}
