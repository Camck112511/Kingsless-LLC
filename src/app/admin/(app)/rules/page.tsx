import { Card, Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { describeRules } from "@/server/views";

export const metadata = { title: "Rules" };

export default async function RulesPage() {
  await requireAdmin();
  const r = describeRules();
  return (
    <>
      <PageHeader title="How the engine decides" subtitle={`Rules v${r.version}. Generated from the same constants the engine runs on. Read-only.`} />
      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-base font-semibold">Gates</h2>
          <ul className="space-y-3">
            {r.gates.map((g) => (
              <li key={g.id} className="rounded-xl border border-line p-4">
                <p className="font-medium">{g.label} {g.hard && <Badge tone="accent">hard rule</Badge>}</p>
                <p className="mt-1 text-sm text-muted">{g.rule}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold">Verdicts</h2>
          <dl className="space-y-2 text-sm">{r.verdicts.map((v) => <div key={v.id}><dt className="inline font-medium">{v.label}: </dt><dd className="inline text-muted">{v.meaning}</dd></div>)}</dl>
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold">Default thresholds (change them in Settings)</h2>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">{r.defaults.map((d) => <div key={d.label} className="flex justify-between gap-4 border-b border-line/60 py-1"><dt>{d.label}<span className="block text-xs text-muted">{d.note}</span></dt><dd className="font-medium tabular-nums">{d.value}</dd></div>)}</dl>
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold">Assumptions used when a fact is unknown</h2>
          <dl className="space-y-2 text-sm">{r.assumptions.map((a) => <div key={a.label}><dt className="font-medium">{a.label}</dt><dd className="text-muted">{a.value}</dd></div>)}</dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">Fit and recommendations</h2>
          <p className="text-sm text-muted">{r.fit.summary}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {r.fit.factors.map((f) => (
              <li key={f.label} className="flex justify-between gap-4 border-b border-line/60 pb-2">
                <span><span className="font-medium">{f.label}</span><span className="block text-xs text-muted">{f.rule}</span></span>
                <span className="tabular-nums text-muted">{f.weight} pts</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">{r.recommendations.map((v) => <div key={v.id}><dt className="inline font-medium">{v.label}: </dt><dd className="inline text-muted">{v.meaning}</dd></div>)}</dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">Ranking</h2>
          <p className="text-sm text-muted">{r.ranking}</p>
          <h2 className="mb-2 mt-5 text-base font-semibold">Win probability</h2>
          <p className="text-sm text-muted">{r.winProbability}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">Principles</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r.honesty.map((h) => <li key={h}>{h}</li>)}</ul>
        </Card>
      </div>
    </>
  );
}
