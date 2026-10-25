"use client";
import { useState } from "react";
import type { ScriptSet } from "@/engine/scripts";
import { Button, Card, CardTitle, Notice, cn } from "@/components/ui";

export function ScriptsPanel({ set }: { set: ScriptSet | undefined }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  if (!set) return <Card><CardTitle>Outreach drafts</CardTitle><p className="text-sm text-muted">Loading…</p></Card>;
  if (set.scripts.length === 0) {
    return (
      <Card>
        <CardTitle>Outreach drafts</CardTitle>
        <Notice tone="neutral">{set.banner}</Notice>
      </Card>
    );
  }
  const s = set.scripts[Math.min(active, set.scripts.length - 1)]!;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("failed");
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(s.subject ?? "")}&body=${encodeURIComponent(s.body)}`;

  return (
    <Card>
      <CardTitle>Outreach drafts</CardTitle>
      <Notice tone="unknown" className="mb-4">{set.banner}</Notice>
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Drafts">
        {set.scripts.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={cn("rounded-lg px-3 py-1.5 text-sm transition", i === active ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:text-ink")}>
            {x.title}
          </button>
        ))}
      </div>
      {s.subject && <p className="mb-2 text-sm"><span className="text-muted">Subject:</span> {s.subject}</p>}
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-bg p-4 font-sans text-sm leading-relaxed">{s.body}</pre>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => copy(s.body, s.id)}>{copied === s.id ? "Copied" : "Copy text"}</Button>
        {s.subject && <a href={mailto} className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">Open in my email app</a>}
        {copied === "failed" && <span className="text-sm text-fail">Copy blocked by the browser; select the text manually.</span>}
      </div>
      {s.internalNotes && <Notice tone="fail" className="mt-4 whitespace-pre-wrap"><strong>Internal. Do not send:</strong>{"\n"}{s.internalNotes}</Notice>}
    </Card>
  );
}
