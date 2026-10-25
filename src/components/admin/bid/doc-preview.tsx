import type { BidDocument, DocBlock } from "@/engine/types";
import { cn } from "@/components/ui";

const BLANK = /(\[[^\]\n]{2,80} – to complete\])/g;

/** Text with the blanks the owner must fill in marked, so they cannot be missed on screen. */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(BLANK).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-unknown-soft px-1 font-semibold text-unknown">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.t) {
    case "h":
      return b.level === 1 ? <h3 className="mt-1 text-base font-semibold"><Text text={b.text} /></h3> : <h4 className="mt-4 text-sm font-semibold"><Text text={b.text} /></h4>;
    case "p":
      return <p className="whitespace-pre-line leading-relaxed"><Text text={b.text} /></p>;
    case "note":
      return <p className="whitespace-pre-line rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-2 text-xs italic text-muted"><Text text={b.text} /></p>;
    case "bullets":
      return <ul className="list-disc space-y-1 pl-5">{b.items.map((x, i) => <li key={i}><Text text={x} /></li>)}</ul>;
    case "sig":
      return <p className="whitespace-pre-line pt-2 text-muted">{b.lines.join("\n")}</p>;
    case "kv":
      return (
        <dl className="divide-y divide-line rounded-lg border border-line">
          {b.rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-3 py-1.5">
              <dt className="text-xs font-medium text-muted">{k}</dt>
              <dd className="whitespace-pre-line"><Text text={v} /></dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted">
              <tr>{b.head.map((h) => <th key={h} className="px-3 py-1.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {b.rows.map((r, i) => <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className="px-3 py-1.5"><Text text={c} /></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DocPreview({ doc, className }: { doc: BidDocument; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border border-line bg-bg p-4 text-sm", className)}>
      {doc.blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}
