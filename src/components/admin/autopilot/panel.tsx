"use client";
import { useState } from "react";
import type { Analysis, AutoPhase, AutoEvent } from "@/engine/types";
import { fmtDate, fmtPct, fmtUsd } from "@/components/format";
import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import { runAutopilotNow, startAutopilot, stopAutopilot, useCloud } from "@/lib/cloud";
import { actions, bidOf, useAppState, type PipelineItem } from "@/lib/store";
import { AuthorizeDialog } from "./authorize-dialog";

export const PHASE: Record<AutoPhase, { label: string; tone: "pass" | "info" | "unknown" | "fail" | "neutral" | "accent" }> = {
  authorized: { label: "Working on it", tone: "accent" },
  "needs-you": { label: "Needs you", tone: "unknown" },
  "ready-to-upload": { label: "Ready to upload", tone: "info" },
  submitted: { label: "Submitted", tone: "pass" },
  watching: { label: "Watching for the result", tone: "pass" },
  won: { label: "Won", tone: "pass" },
  lost: { label: "Lost", tone: "neutral" },
  stopped: { label: "Stopped", tone: "fail" },
  expired: { label: "Missed the deadline", tone: "fail" },
};

const KIND_TONE: Record<AutoEvent["kind"], "pass" | "info" | "unknown" | "fail" | "neutral" | "accent"> = {
  authorized: "accent", info: "neutral", price: "info", "needs-you": "unknown", ready: "info", submitted: "pass", award: "unknown", won: "pass", lost: "neutral", stopped: "fail", error: "fail",
};

export function PhaseBadge({ phase }: { phase: AutoPhase }) {
  const m = PHASE[phase];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ActivityFeed({ events, limit = 12, empty = "Nothing yet." }: { events: AutoEvent[]; limit?: number; empty?: string }) {
  const shown = [...events].reverse().slice(0, limit);
  if (shown.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line text-sm">
      {shown.map((e) => (
        <li key={e.id} className="px-3 py-2.5">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={KIND_TONE[e.kind]}>{e.kind.replace("-", " ")}</Badge>
            <span className="font-medium">{e.title}</span>
            <span className="ml-auto text-xs text-muted">{fmtDate(e.at)}</span>
          </p>
          {e.detail && <p className="mt-1 text-xs text-muted">{e.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The master switch: Start / Stop for all of autopilot, plus a button to check right now. */
export function RunControls({ itemId }: { itemId?: string }) {
  const cloud = useCloud();
  const state = useAppState();
  const [msg, setMsg] = useState<string | null>(null);
  if (!state) return null;
  const on = !state.autopilotPaused;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {on ? (
        <Button variant="danger" onClick={() => { if (window.confirm("Stop all autopilot activity? Nothing will run until you press Start. A bid that was already emailed cannot be recalled.")) stopAutopilot(); }}>Stop autopilot</Button>
      ) : (
        <Button variant="primary" onClick={() => startAutopilot()}>Start autopilot</Button>
      )}
      <Button
        disabled={cloud.running || !on}
        onClick={async () => {
          setMsg(null);
          setMsg(await runAutopilotNow({ itemId }));
        }}
      >
        {cloud.running ? "Working…" : itemId ? "Check this bid now" : "Check now"}
      </Button>
      <span className="text-xs text-muted">{msg ?? (on ? "Running while this page is open." : "Stopped: nothing runs.")}{!msg && cloud.lastRunAt ? ` Last check ${fmtDate(cloud.lastRunAt)}.` : ""}</span>
    </div>
  );
}

/** Autopilot for one bid: status, what it needs from you, the price it chose and why, and the controls. */
export function AutopilotPanel({ item, analysis }: { item: PipelineItem; analysis: Analysis | undefined }) {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const bid = bidOf(item);
  const auto = bid.auto;
  const id = item.opportunity.id;
  if (!state) return null;
  const mine = state.events.filter((e) => e.itemId === id);

  if (!auto) {
    return (
      <Card>
        <CardTitle aside={<Badge>Off</Badge>}>Autopilot</CardTitle>
        <p className="text-sm text-muted">Let the engine go after this bid on its own: it prices it, checks every rule, writes the documents, submits within your limits, then watches for the result. After a win it tells you who to sell the contract to.</p>
        <Button className="mt-3" variant="primary" disabled={analysis?.verdict === "reject"} onClick={() => setOpen(true)}>Let the engine go after this bid</Button>
        {analysis?.verdict === "reject" && <p className="mt-2 text-xs text-fail">This bid is rejected under your rules, so autopilot is not offered.</p>}
        {open && <AuthorizeDialog ids={[id]} analyses={{ [id]: analysis }} onClose={() => setOpen(false)} />}
      </Card>
    );
  }

  const p = auto.progress;
  const price = p.pricing;
  return (
    <Card>
      <CardTitle aside={<PhaseBadge phase={p.phase} />}>Autopilot</CardTitle>
      <div className="space-y-3 text-sm">
        <p>{state.autopilotPaused && !["submitted", "watching", "won", "lost", "stopped", "expired"].includes(p.phase) ? "Autopilot is stopped, so nothing will happen on this bid until you press Start." : p.summary || "Waiting for the first pass."}</p>
        {p.needs.length > 0 && (
          <Notice tone="unknown">
            <strong>Needs you:</strong>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{p.needs.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </Notice>
        )}
        {price && (
          <div className="rounded-xl border border-line p-3">
            <p className="font-medium">Price chosen: {fmtUsd(price.priceUsd)}</p>
            <p className="mt-0.5 text-xs text-muted">About {fmtPct(price.winProbability)} to win · {fmtUsd(price.profitUsd)} profit if it does ({fmtPct(price.marginRate, 1)}) · within {fmtUsd(price.floorUsd)} to {fmtUsd(price.ceilingUsd)}</p>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted">Why this price</summary>
              <p className="mt-1 text-muted">{price.note}</p>
              <table className="mt-2 w-full text-left">
                <thead className="text-muted"><tr><th className="py-1">Price</th><th>Win chance</th><th>Profit if won</th><th>Expected</th></tr></thead>
                <tbody>{price.considered.map((c) => <tr key={c.priceUsd} className={c.priceUsd === price.priceUsd ? "font-semibold" : ""}><td className="py-0.5 tabular-nums">{fmtUsd(c.priceUsd)}</td><td>{fmtPct(c.winProbability)}</td><td className="tabular-nums">{fmtUsd(c.profitUsd)}</td><td className="tabular-nums">{fmtUsd(c.expectedProfitUsd)}</td></tr>)}</tbody>
              </table>
            </details>
            <p className="mt-2 text-xs text-muted">Autopilot sets the price while it is on. Steer it with the floor and ceiling, or pause it to price by hand.</p>
          </div>
        )}
        <p className="text-xs text-muted">
          Authorized {fmtDate(auto.auth.authorizedAt)} · floor {auto.auth.floorUsd ? fmtUsd(auto.auth.floorUsd) : "walk-away price"} · ceiling {auto.auth.ceilingUsd ? fmtUsd(auto.auth.ceilingUsd) : "expected market price"} · {auto.auth.allowEstimateOnly ? "may bid on your estimate" : "waits for a firm quote"}{p.lastRunAt ? ` · last pass ${fmtDate(p.lastRunAt)}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RunControls itemId={id} />
          {p.phase !== "stopped" && p.phase !== "won" && p.phase !== "lost" && p.phase !== "expired" && (
            <Button variant="danger" onClick={() => { if (window.confirm("Stop autopilot for THIS bid? Anything already sent cannot be recalled.")) actions.stopAuto(id); }}>Stop this bid</Button>
          )}
          {(p.phase === "stopped" || p.phase === "expired") && <Button onClick={() => actions.restartAuto(id)}>Restart this bid</Button>}
        </div>
        {mine.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted">What it has done ({mine.length})</summary>
            <div className="mt-2"><ActivityFeed events={mine} limit={20} /></div>
          </details>
        )}
      </div>
    </Card>
  );
}
