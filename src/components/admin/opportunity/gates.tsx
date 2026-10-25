import type { Analysis } from "@/engine/types";
import { Card, CardTitle } from "@/components/ui";
import { GateBadge } from "../verdict";

export function GatesPanel({ analysis }: { analysis: Analysis }) {
  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">Unproven is never treated as a pass</span>}>Gates</CardTitle>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {analysis.gates.map((g) => (
          <article key={g.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {g.label}
                {g.hard && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted">hard rule</span>}
              </h3>
              <GateBadge status={g.status} />
            </div>
            <p className="mt-2 text-sm leading-relaxed">{g.summary}</p>
            {g.details.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
                {g.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            {g.fixableBy && <p className="mt-2 text-xs text-info">Could be cleared by: {g.fixableBy}</p>}
            {g.evidence.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted">Evidence ({g.evidence.length})</summary>
                <ul className="mt-1 space-y-1">
                  {g.evidence.map((e, i) => (
                    <li key={i} className="border-l-2 border-line pl-2 italic text-muted">
                      {e}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {g.questions.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-unknown">
                {g.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </Card>
  );
}
