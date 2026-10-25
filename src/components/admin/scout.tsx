"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Settings } from "@/engine/types";
import { fmtDate, fmtUsd, safeUrl } from "@/components/format";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, cn } from "@/components/ui";
import { scoutFeedsApi, scoutSamApi, scoutWebApi } from "@/lib/api";
import { actions, useAppState } from "@/lib/store";
import type { ScoutItem, ScoutResult } from "@/server/sources/leads";
import type { Capabilities } from "@/server/views";
import { Discover } from "./discover";
import { FitMeter } from "./recommendation";
import { MarketPanel } from "./market";

type Source = "web" | "sam" | "feeds";
type RunState = { status: "idle" | "running" | "done" | "error" | "skipped"; count: number; message: string };
const SOURCE_LABEL: Record<Source, string> = { web: "AI web search", sam: "SAM.gov", feeds: "Your bid feeds" };
const IDLE: RunState = { status: "idle", count: 0, message: "" };
const WEAK_FIT = 40;

type Tab = "find" | "market" | "sam";

export function Scout({ caps }: { caps: Capabilities }) {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>("find");
  const [extra, setExtra] = useState("");
  const [runs, setRuns] = useState<Record<Source, RunState>>({ web: IDLE, sam: IDLE, feeds: IDLE });
  const [items, setItems] = useState<ScoutItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [showWeak, setShowWeak] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const settings = state?.settings;
  const busy = Object.values(runs).some((r) => r.status === "running");
  const inPipeline = useMemo(() => new Set((state?.items ?? []).map((i) => i.opportunity.id)), [state]);

  if (!state || !settings) return <p className="text-sm text-muted">Loading…</p>;

  function merge(source: Source, result: ScoutResult) {
    setItems((cur) => {
      const byId = new Map(cur.map((i) => [i.opportunity.id, i]));
      for (const it of result.items) {
        const prev = byId.get(it.opportunity.id);
        if (!prev || it.fit.score > prev.fit.score) byId.set(it.opportunity.id, it);
      }
      return [...byId.values()].sort((a, b) => b.fit.score - a.fit.score);
    });
    setNotes((n) => [...n, ...result.notes.map((x) => `${SOURCE_LABEL[source]}: ${x}`)]);
    setRuns((r) => ({ ...r, [source]: { status: "done", count: result.items.length, message: "" } }));
  }
  const fail = (source: Source, message: string) => setRuns((r) => ({ ...r, [source]: { status: "error", count: 0, message } }));
  const skip = (source: Source, message: string) => setRuns((r) => ({ ...r, [source]: { status: "skipped", count: 0, message } }));

  async function findAll(s: Settings) {
    setItems([]);
    setNotes([]);
    setShowWeak(false);
    setRuns({ web: IDLE, sam: IDLE, feeds: IDLE });
    const tasks: Array<Promise<void>> = [];

    if (caps.ai) {
      setRuns((r) => ({ ...r, web: { status: "running", count: 0, message: "" } }));
      tasks.push(scoutWebApi(s, extra).then((res) => (res.ok ? merge("web", res.data) : fail("web", res.error))));
    } else skip("web", "Needs ANTHROPIC_API_KEY on the server.");

    if (caps.sam) {
      setRuns((r) => ({ ...r, sam: { status: "running", count: 0, message: "" } }));
      const t = s.targeting;
      const state0 = s.serviceArea.scope === "selected" ? s.serviceArea.states[0] : undefined;
      // SAM.gov limits requests per day, so use at most two: the first code and the first word you target.
      const queries: Array<{ ncode?: string; keyword?: string; state?: string }> = [];
      if (t.naics[0]) queries.push({ ncode: t.naics[0], state: state0 });
      if (t.keywords[0]) queries.push({ keyword: t.keywords[0], state: state0 });
      if (queries.length === 0) queries.push({ state: state0 });
      tasks.push(
        Promise.all(queries.slice(0, 2).map((q) => scoutSamApi(s, q))).then((all) => {
          const okAll = all.filter((r) => r.ok);
          if (okAll.length === 0) {
            const firstErr = all.find((r) => !r.ok);
            return fail("sam", firstErr && !firstErr.ok ? firstErr.error : "SAM.gov search failed.");
          }
          merge("sam", { items: okAll.flatMap((r) => (r.ok ? r.data.items : [])), notes: okAll.flatMap((r) => (r.ok ? r.data.notes : [])), dropped: 0, searches: okAll.length, model: null });
        }),
      );
    } else skip("sam", "Needs SAM_GOV_API_KEY on the server.");

    if (s.targeting.feeds.length > 0) {
      setRuns((r) => ({ ...r, feeds: { status: "running", count: 0, message: "" } }));
      tasks.push(scoutFeedsApi(s).then((res) => (res.ok ? merge("feeds", res.data) : fail("feeds", res.error))));
    } else skip("feeds", "No feeds added yet (Settings, “Bid feeds to watch”).");

    await Promise.all(tasks);
  }

  const configured = settings.targeting.keywords.length + settings.targeting.naics.length + settings.targeting.categories.length > 0;
  const visible = items.filter((i) => showWeak || !i.fit.configured || i.fit.score >= WEAK_FIT);
  const hidden = items.length - visible.length;
  const area = settings.serviceArea;
  const areaText = area.scope === "selected" && (area.states.length || area.places.length) ? [...area.places, ...area.states].join(", ") : "anywhere";

  return (
    <>
      <PageHeader
        title="Find bids"
        subtitle="One button searches the open web with AI, SAM.gov and your own bid feeds, then ranks everything by how well it fits your business. Nothing is recommended until the rules are proven after you add it."
      />

      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Ways to find bids">
        {(
          [
            ["find", "Find bids for me"],
            ["market", "Market research"],
            ["sam", "SAM.gov search"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("rounded-full px-3.5 py-1.5 text-sm transition", tab === id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink")}>
            {label}
          </button>
        ))}
        <Link href="/admin/new" className="rounded-full bg-surface-2 px-3.5 py-1.5 text-sm text-muted transition hover:text-ink">
          Import a link or paste →
        </Link>
      </div>

      {tab === "find" && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Searching for</p>
                <p className="mt-0.5 text-sm">
                  {configured ? [...settings.targeting.keywords, ...settings.targeting.naics].slice(0, 8).join(", ") : <span className="text-unknown">Nothing set yet: results will not be ranked for your business.</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Where: {areaText} · <Link href="/admin/settings" className="text-accent underline">Change what you want</Link>
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Anything specific this time? (optional)" hint="e.g. “school districts only” or “emergency repair work”">
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={400} placeholder="Leave blank to search for everything you target" />
              </Field>
              <Button variant="primary" disabled={busy} onClick={() => void findAll(settings)} className="h-10">
                {busy ? "Searching…" : "Find bids for me"}
              </Button>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Search progress">
              {(Object.keys(runs) as Source[]).map((k) => {
                const r = runs[k];
                return (
                  <li key={k}>
                    <Badge tone={r.status === "done" ? "pass" : r.status === "error" ? "fail" : r.status === "running" ? "info" : "neutral"}>
                      {SOURCE_LABEL[k]}: {r.status === "idle" ? "ready" : r.status === "running" ? "searching…" : r.status === "done" ? `${r.count} found` : r.status === "skipped" ? "not set up" : "problem"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {(Object.keys(runs) as Source[]).map((k) =>
              runs[k].message ? (
                <p key={k} className={cn("mt-1 text-xs", runs[k].status === "error" ? "text-fail" : "text-muted")}>
                  {runs[k].message}
                </p>
              ) : null,
            )}
            {runs.web.status === "running" && <p className="mt-2 text-xs text-muted">The AI web search reads many procurement sites and can take a minute or two.</p>}
          </Card>

          {!caps.ai && (
            <Notice tone="unknown" className="mb-4">
              <strong>AI web search is off.</strong> Add <code>ANTHROPIC_API_KEY</code> to the server environment to let the console search procurement sites across the whole web. SAM.gov and your feeds work without it.
            </Notice>
          )}

          {notes.length > 0 && (
            <ul className="mb-3 space-y-0.5 text-xs text-muted">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {visible.length} match{visible.length === 1 ? "" : "es"}, best fit first.
                {hidden > 0 && !showWeak && ` ${hidden} weaker result${hidden === 1 ? " is" : "s are"} hidden.`}
              </p>
              <div className="flex gap-2">
                {hidden > 0 && <Button variant="ghost" onClick={() => setShowWeak((v) => !v)}>{showWeak ? "Hide weaker matches" : "Show weaker matches"}</Button>}
                <Button
                  onClick={() => {
                    const fresh = visible.filter((i) => !inPipeline.has(i.opportunity.id) && !added.has(i.opportunity.id)).map((i) => i.opportunity);
                    actions.addItems(fresh);
                    setAdded((s) => new Set([...s, ...fresh.map((o) => o.id)]));
                  }}
                >
                  Add all shown to my bids
                </Button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {visible.map((it) => (
              <ResultCard key={it.opportunity.id} item={it} settings={settings} inPipeline={inPipeline.has(it.opportunity.id) || added.has(it.opportunity.id)} onAdd={() => { actions.addItems([it.opportunity]); setAdded((s) => new Set(s).add(it.opportunity.id)); }} />
            ))}
          </ul>
          {items.length === 0 && !busy && Object.values(runs).some((r) => r.status === "done") && <p className="text-sm text-muted">Nothing matched this time. Try broadening the words or location in Settings.</p>}
        </>
      )}

      {tab === "market" && <MarketPanel settings={settings} />}
      {tab === "sam" && <Discover embedded />}
    </>
  );
}

function ResultCard({ item, settings, inPipeline, onAdd }: { item: ScoutItem; settings: Settings; inPipeline: boolean; onAdd: () => void }) {
  const o = item.opportunity;
  const loc = [o.location.city, o.location.state].filter(Boolean).join(", ");
  const factors = item.fit.factors;
  const where = factors.find((f) => f.id === "location");
  const federalNeedsSam = o.level === "federal" && !settings.profile.samRegistered;
  const link = safeUrl(o.sourceUrl);
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="font-medium">{o.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {o.solicitationNumber || "no number"} · {o.agency || "unknown agency"} · {loc || "location not stated"} · due {fmtDate(o.dueDate)}
            {o.valueEstimate.high ? ` · about ${fmtUsd(o.valueEstimate.high)}` : ""}
          </p>
        </div>
        <FitMeter fit={item.fit} />
      </div>
      {item.whyItFits && <p className="mt-2 text-sm">{item.whyItFits}</p>}
      {o.scope && !item.whyItFits && <p className="mt-2 line-clamp-2 text-sm text-muted">{o.scope}</p>}
      <p className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="neutral">{item.portal || o.source}</Badge>
        {where && <Badge tone={where.outcome === "match" ? "pass" : where.outcome === "miss" ? "fail" : "unknown"}>{where.outcome === "match" ? "In your area" : where.outcome === "miss" ? "Outside your area" : "Location unclear"}</Badge>}
        {federalNeedsSam && <Badge tone="fail">Federal: needs SAM.gov registration</Badge>}
        {o.terms.setAside !== "none" && o.terms.setAside !== "unknown" && <Badge tone="info">Set-aside: {o.terms.setAside}</Badge>}
        {o.terms.subcontracting === "prohibited" && <Badge tone="fail">Subcontracting not allowed</Badge>}
        {item.fit.excluded && <Badge tone="fail">On your avoid list</Badge>}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {inPipeline ? (
          <Link href={`/admin/opportunities/${encodeURIComponent(o.id)}`} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface-2">
            In your bids: open →
          </Link>
        ) : (
          <Button variant="primary" onClick={onAdd}>Add to my bids</Button>
        )}
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">Official listing ↗</a>}
        <span className="text-xs text-muted">The engine checks the rules after you add it.</span>
      </div>
    </li>
  );
}
