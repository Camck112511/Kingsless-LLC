import type { Analysis, Fit, FitOutcome, Recommendation, RecommendationTier } from "@/engine/types";
import { Badge, Card, CardTitle, cn } from "@/components/ui";

const tierMeta: Record<RecommendationTier, { label: string; tone: "pass" | "info" | "accent" | "unknown" | "fail" | "neutral" }> = {
  "top-pick": { label: "Top pick", tone: "pass" },
  recommended: { label: "Recommended", tone: "pass" },
  consider: { label: "Weaker fit", tone: "info" },
  "research-first": { label: "Research first", tone: "unknown" },
  "not-recommended": { label: "Not recommended", tone: "fail" },
};

export const tierLabel = (t: RecommendationTier): string => tierMeta[t].label;
export const isRecommended = (r: Recommendation): boolean => r.tier === "top-pick" || r.tier === "recommended";

export function RecommendationBadge({ recommendation }: { recommendation: Recommendation }) {
  const m = tierMeta[recommendation.tier];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** A thin bar with the fit score beside it. Text is always present, so colour is never the only signal. */
export function FitMeter({ fit, className }: { fit: Fit; className?: string }) {
  const tone = !fit.configured ? "bg-muted/40" : fit.score >= 70 ? "bg-pass" : fit.score >= 50 ? "bg-info" : "bg-unknown";
  return (
    <div className={cn("flex items-center gap-2", className)} title={fit.summary}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${fit.configured ? fit.score : 0}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{fit.configured ? `${fit.score}` : "—"}</span>
    </div>
  );
}

const outcomeMeta: Record<FitOutcome, { icon: string; cls: string; label: string }> = {
  match: { icon: "✓", cls: "text-pass", label: "Match" },
  partial: { icon: "◐", cls: "text-info", label: "Partly" },
  unknown: { icon: "?", cls: "text-unknown", label: "Unknown" },
  miss: { icon: "✕", cls: "text-fail", label: "Miss" },
};

export function FitPanel({ analysis }: { analysis: Analysis }) {
  const { fit, recommendation } = analysis;
  return (
    <Card>
      <CardTitle aside={<RecommendationBadge recommendation={recommendation} />}>Fit with your business</CardTitle>
      <p className="text-sm font-medium">{recommendation.headline}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {recommendation.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {fit.factors.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {fit.factors.map((f) => {
            const m = outcomeMeta[f.outcome];
            return (
              <li key={f.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span className={cn("mt-0.5 w-5 text-center font-semibold", m.cls)} aria-label={m.label}>
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.label}</p>
                  <p className="text-xs text-muted">{f.detail}</p>
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted">
                  {Math.round(f.earned)}/{f.max}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!fit.configured && (
        <p className="mt-3 text-xs text-muted">
          Set what work, size and place you want under <a href="/admin/settings" className="underline">Settings</a> and every listing will be scored against it.
        </p>
      )}
    </Card>
  );
}
