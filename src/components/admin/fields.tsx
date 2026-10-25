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
