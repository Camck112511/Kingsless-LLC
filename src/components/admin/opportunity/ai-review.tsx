"use client";
import { useState } from "react";
import { fmtDate } from "@/components/format";
import { Badge, Button, Card, CardTitle, Notice, Textarea } from "@/components/ui";
import { reviewApi } from "@/lib/api";
import { actions, type AppState } from "@/lib/store";

const stanceMeta = {
  pursue: { label: "AI leans: pursue", tone: "pass" as const },
  "pursue-with-conditions": { label: "AI leans: pursue, with conditions", tone: "info" as const },
  pass: { label: "AI leans: pass", tone: "fail" as const },
};
const sevTone = { high: "fail", medium: "unknown", low: "neutral" } as const;

export function AiReviewPanel({ state, id, aiEnabled }: { state: AppState; id: string; aiEnabled: boolean }) {
  const item = state.items.find((i) => i.opportunity.id === id);
  const [text, setText] = useState("");
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!item) return null;
  const r = item.aiReview ?? null;

  async function run() {
    setBusy(true);
    setError(null);
    const res = await reviewApi(state, id, { text, research });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    actions.updateItem(id, { aiReview: res.data });
  }

  return (
    <Card>
      <CardTitle aside={<Badge>Advisory only</Badge>}>AI second opinion</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-muted">
        The AI reads the listing, the official page (when it allows it) and the engine&apos;s findings, then points out strengths, risks and what to find out. It cannot change a verdict, a price or a recommendation.
      </p>
      {!aiEnabled && (
        <Notice tone="unknown" className="mb-3">
          Needs <code>ANTHROPIC_API_KEY</code> on the server.
        </Notice>
      )}
      <details className="mb-3">
        <summary className="cursor-pointer text-sm font-medium">Paste more of the solicitation (optional, makes the review sharper)</summary>
        <Textarea className="mt-2 min-h-32" value={text} onChange={(e) => setText(e.target.value)} placeholder="Scope, instructions to bidders, insurance, payment and subcontracting sections…" />
      </details>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /> Also research the agency and comparable awards on the web (slower, costs more)
      </label>
      <Button variant="primary" disabled={busy || !aiEnabled} onClick={() => void run()}>
        {busy ? (research ? "Reviewing and researching…" : "Reviewing…") : r ? "Review again" : "Review this bid with AI"}
      </Button>
      {error && <Notice tone="fail" className="mt-3">{error}</Notice>}

      {r && (
        <div className="mt-5 space-y-4 border-t border-line pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stanceMeta[r.review.stance].tone}>{stanceMeta[r.review.stance].label}</Badge>
            <span className="text-xs text-muted">
              Engine says: <strong>{r.engine.verdict}</strong> · reviewed {fmtDate(r.reviewedAt)} · {r.pastedChars + r.sourcePageChars > 0 ? `read ${(r.pastedChars + r.sourcePageChars).toLocaleString()} characters of the solicitation` : "no solicitation text was available"}
              {r.searches > 0 ? ` · ${r.searches} web searches` : ""}
            </span>
          </div>
          <p>{r.review.summary}</p>
          {r.engine.verdict === "reject" && r.review.stance !== "pass" && <Notice tone="unknown">The engine rejected this bid. The AI&apos;s view does not override that.</Notice>}
          {r.review.strengths.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Strengths</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted">{r.review.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {r.review.risks.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Risks</h3>
              <ul className="space-y-2">
                {r.review.risks.map((x, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <p><Badge tone={sevTone[x.severity]} className="mr-2">{x.severity}</Badge>{x.risk}</p>
                    {x.quote && <blockquote className="mt-1 border-l-2 border-accent pl-3 text-xs italic text-muted">“{x.quote}” <span className="not-italic">(found in the document)</span></blockquote>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.review.unknowns.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Find out before bidding</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted">{r.review.unknowns.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div><h3 className="mb-1 font-semibold">Pricing</h3><p className="text-muted">{r.review.pricingAdvice}</p></div>
            <div><h3 className="mb-1 font-semibold">Competition</h3><p className="text-muted">{r.review.competitionNotes}</p></div>
          </div>
          {r.review.nextSteps.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Suggested next steps</h3>
              <ol className="list-decimal space-y-1 pl-5 text-muted">{r.review.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </div>
          )}
          <p className="text-xs text-muted">AI opinions can be wrong. Quotes shown were checked against the document; everything else is the AI&apos;s judgement.</p>
        </div>
      )}
    </Card>
  );
}
