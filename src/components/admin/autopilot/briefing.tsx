"use client";
import { useState } from "react";
import type { WinBriefing } from "@/engine/types";
import { fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, CardTitle } from "@/components/ui";
import { subFromResearch } from "@/lib/intake";
import { actions, useAppState } from "@/lib/store";

const LABEL = { verified: "Verified", "partially-verified": "Partly verified", unverified: "Unverified", lead: "Lead: unverified" } as const;

/** What you won, what it means, what to offer a subcontractor, and who to offer it to, best first. */
export function WinBriefingView({ briefing }: { briefing: WinBriefing }) {
  const state = useAppState();
  const [copied, setCopied] = useState<string | null>(null);
  const have = new Set((state?.subcontractors ?? []).map((s) => s.name.toLowerCase()));
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked: the text is selectable on screen */
    }
  };
  const o = briefing.offer;

  return (
    <div className="space-y-5 text-sm">
      <Card>
        <CardTitle aside={<Badge tone="pass">Won</Badge>}>{briefing.headline}</CardTitle>
        <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {briefing.contract.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line/60 py-1">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardTitle>What to offer a subcontractor</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Open at</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(o.openingOfferUsd)}</p><p className="text-xs text-muted">Your profit about {fmtUsd(o.profitAtOpeningUsd)}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Never pay more than</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(o.maxSubPriceUsd)}</p><p className="text-xs text-muted">Your profit about {fmtUsd(o.profitAtMaxUsd)}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">The award</p><p className="text-lg font-semibold tabular-nums">{fmtUsd(o.awardUsd)}</p><p className="text-xs text-muted">Keep this to yourself</p></div>
        </div>
        <p className="mt-3 text-xs text-muted">Do not tell a subcontractor what the agency is paying, or your maximum. Open at the first number and only move up if you must.</p>
      </Card>

      <Card>
        <CardTitle aside={<span className="text-xs text-muted">{briefing.subs.length} ranked</span>}>Who to sell it to, best first</CardTitle>
        {briefing.subs.length === 0 ? (
          <p className="text-muted">No candidates yet. Use “Find more subcontractors” below.</p>
        ) : (
          <ol className="space-y-3">
            {briefing.subs.map((s, i) => {
              const inDir = s.subcontractorId !== null || have.has(s.name.toLowerCase());
              return (
                <li key={s.name} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 max-w-2xl">
                      <p className="font-medium">
                        <span className="mr-2 text-muted">{i + 1}.</span>
                        {s.name} <Badge tone={s.label === "verified" ? "pass" : s.label === "partially-verified" ? "unknown" : "neutral"} className="ml-1">{LABEL[s.label]}</Badge>
                      </p>
                      <p className="mt-1 text-xs text-muted">Score {s.score}/100 · {s.source === "directory" ? "from your directory" : s.source === "web" ? "found on the web" : "from federal subaward records"}</p>
                      {s.reasons.length > 0 && <p className="mt-2">✓ {s.reasons.slice(0, 4).join(" · ")}</p>}
                      {s.concerns.length > 0 && <p className="mt-1 text-xs text-unknown">! {s.concerns.slice(0, 3).join(" ")}</p>}
                      {s.contact && <p className="mt-2 whitespace-pre-line text-xs">{s.contact}</p>}
                      <p className="mt-1 flex gap-4 text-xs">
                        {safeUrl(s.website) && <a className="text-accent underline" href={safeUrl(s.website) ?? undefined} target="_blank" rel="noopener noreferrer">Website ↗</a>}
                        {safeUrl(s.sourceUrl) && <a className="text-muted underline" href={safeUrl(s.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Where it was found ↗</a>}
                      </p>
                    </div>
                    {!inDir && (
                      <Button onClick={() => actions.upsertSub(subFromResearch({ name: s.name, services: [], coverage: [], contact: s.contact, notes: `Added from the win briefing (${s.source}). ${s.reasons.join(". ")}. Nothing verified yet.` }))}>Add to my directory</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card>
        <CardTitle aside={<Button onClick={() => void copy("msg", `${briefing.offerMessage.subject}\n\n${briefing.offerMessage.body}`)}>{copied === "msg" ? "Copied" : "Copy"}</Button>}>The message to send each one</CardTitle>
        <p className="mb-2 text-xs text-muted">The app never sends this for you. It says nothing about what the agency pays or your maximum.</p>
        <p className="font-medium">{briefing.offerMessage.subject}</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm">{briefing.offerMessage.body}</pre>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>What you now owe</CardTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">{briefing.obligations.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Card>
        <Card>
          <CardTitle>Risks to watch</CardTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">{briefing.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Card>
      </div>
      <Card>
        <CardTitle>Next steps</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5">{briefing.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </Card>
    </div>
  );
}
