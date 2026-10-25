"use client";
import Link from "next/link";
import { useState } from "react";
import type { WorkflowStep } from "@/engine/types";
import { fmtDate } from "@/components/format";
import { Badge, Card, Notice, cn } from "@/components/ui";
import { bidOf, useAppState } from "@/lib/store";
import { useBidPlan } from "@/lib/use-bid-plan";
import type { Capabilities } from "@/server/views";
import { RecommendationBadge } from "../recommendation";
import { VerdictBadge } from "../verdict";
import { CheckStep, DocsStep, FitStep, PriceStep, ProveStep, QuotesStep, ResultStep, SubmitStep, WinStep, type StepProps } from "./steps";

const PANELS: Record<WorkflowStep["id"], (p: StepProps) => React.ReactNode> = {
  fit: FitStep,
  prove: ProveStep,
  quotes: QuotesStep,
  price: PriceStep,
  docs: DocsStep,
  check: CheckStep,
  submit: SubmitStep,
  result: ResultStep,
  win: WinStep,
};

const STATUS: Record<WorkflowStep["status"], { icon: string; label: string; cls: string }> = {
  done: { icon: "✓", label: "Done", cls: "bg-pass-soft text-pass" },
  todo: { icon: "●", label: "Next", cls: "bg-accent-soft text-accent" },
  blocked: { icon: "✕", label: "Blocked", cls: "bg-fail-soft text-fail" },
  locked: { icon: "○", label: "Later", cls: "bg-surface-2 text-muted" },
};

export function BidWorkspace({ id, caps }: { id: string; caps: Capabilities }) {
  const state = useAppState();
  const item = state?.items.find((i) => i.opportunity.id === id);
  const { plan, loading, error } = useBidPlan(state, id, item ? bidOf(item).prep.submissionEmail : "");
  const [open, setOpen] = useState<string | null>(null);

  if (!state) return <p className="text-sm text-muted">Loading…</p>;
  if (!item) {
    return (
      <Card>
        <p className="font-medium">Opportunity not found.</p>
        <p className="mt-1 text-sm text-muted">It may have been removed, or your data lives in a different browser. <Link href="/admin" className="underline">Back to your bids</Link></p>
      </Card>
    );
  }
  const o = item.opportunity;
  const openId = open ?? plan?.currentId ?? null;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/opportunities/${encodeURIComponent(id)}`} className="text-sm text-muted hover:text-ink">← Opportunity details</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bid workspace</h1>
            <p className="mt-1 text-sm text-muted">{o.title} · {o.solicitationNumber || "no number"} · {o.agency || "unknown agency"} · due {fmtDate(o.dueDate)}{plan?.analysis.daysToDeadline != null ? ` (${plan.analysis.daysToDeadline} days)` : ""}</p>
          </div>
          {plan && (
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={plan.analysis.verdict} />
              <RecommendationBadge recommendation={plan.analysis.recommendation} />
            </div>
          )}
        </div>
      </div>

      <Notice tone="info">
        The console drafts, checks and tracks. <strong>You decide and you sign.</strong> It never sends anything to an agency or a subcontractor unless you press the send button on the final step, and only when every rule is proven.
      </Notice>
      {error && <Notice tone="fail">{error}</Notice>}
      {!plan && !error && <p className="text-sm text-muted">{loading ? "Running the engine…" : ""}</p>}

      {plan && (
        <ol className="space-y-3" aria-label="Bid steps">
          {plan.steps.map((step, i) => {
            const m = STATUS[step.status];
            const isOpen = openId === step.id;
            const Panel = PANELS[step.id];
            return (
              <li key={step.id} className={cn("rounded-[var(--radius-card)] border bg-surface", step.id === plan.currentId ? "border-accent" : "border-line")}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`step-${step.id}`}
                  onClick={() => setOpen(isOpen ? "" : step.id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                >
                  <span className={cn("mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", m.cls)} aria-hidden>{step.status === "done" ? "✓" : step.status === "blocked" ? "✕" : i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{step.title}</span>
                      <Badge tone={step.status === "done" ? "pass" : step.status === "blocked" ? "fail" : step.status === "todo" ? "accent" : "neutral"}>{m.label}</Badge>
                    </span>
                    {!isOpen && step.lines[0] && <span className="mt-0.5 block truncate text-xs text-muted">{step.lines[0]}</span>}
                  </span>
                  <span aria-hidden className="mt-1 text-muted">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div id={`step-${step.id}`} className="space-y-4 border-t border-line px-4 py-4">
                    <p className="text-sm"><span className="font-semibold">Why this step: </span><span className="text-muted">{step.why}</span></p>
                    {step.lines.length > 0 && step.status !== "done" && <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">{step.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>}
                    {step.status === "locked" && <p className="text-xs text-muted">You can look ahead, but finish the earlier steps first.</p>}
                    <Panel state={state} item={item} plan={plan} caps={caps} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
