"use client";
import { useState } from "react";
import { Input } from "@/components/ui";

/**
 * Number input that allows blank (null = unknown), shows rates as percentages, and never fights the user's typing.
 * `mode="rate"` shows 0.38 as 38 and stores fractions. While the field has focus the typed text is kept as a draft.
 */
export function NumberField({
  value,
  onChange,
  mode = "number",
  placeholder,
  prefix,
  suffix,
  min = 0,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  mode?: "number" | "rate";
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  id?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? "" : String(mode === "rate" ? Math.round(value * 10_000) / 100 : value);

  return (
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
      <Input
        {...rest}
        inputMode="decimal"
        value={draft ?? shown}
        placeholder={placeholder}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (t.trim() === "") return onChange(null);
          const n = Number(t);
          if (Number.isNaN(n) || n < min) return;
          onChange(mode === "rate" ? n / 100 : n);
        }}
      />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  );
}

/** A list of short values entered as chips: type and press Enter (or comma) to add, click a chip to remove it. */
export function TagField({
  value,
  onChange,
  placeholder,
  normalize = (s) => s.trim(),
  "aria-label": ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Return "" to reject an entry. */
  normalize?: (raw: string) => string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(normalize).filter(Boolean);
    if (parts.length === 0) return;
    onChange([...value, ...parts.filter((p) => !value.some((v) => v.toLowerCase() === p.toLowerCase()))]);
    setDraft("");
  };
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent hover:opacity-80"
          >
            {v} <span aria-hidden>×</span>
          </button>
        ))}
        <input
          aria-label={ariaLabel}
          value={draft}
          placeholder={value.length === 0 ? placeholder : "Add another…"}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
        />
      </div>
    </div>
  );
}
