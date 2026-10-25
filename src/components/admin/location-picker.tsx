"use client";
import { useState } from "react";
import type { ServiceArea } from "@/engine/types";
import { Badge, Field, Input, Select, cn } from "@/components/ui";
import { US_STATES } from "@/lib/us-states";

const nameOf = (code: string) => US_STATES.find((s) => s.code === code)?.name ?? code;

/**
 * Choose where you will work: anywhere, or specific states and (optionally) cities/counties.
 * The engine uses this to find, filter and qualify contracts. It only edits the selection; matching happens in the engine.
 */
export function LocationPicker({ area, onChange }: { area: ServiceArea; onChange: (a: ServiceArea) => void }) {
  const [pick, setPick] = useState("");
  const selected = area.scope === "selected";

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Where do you want to work?" className="flex flex-wrap gap-2">
        {([["anywhere", "Anywhere"], ["selected", "Only these places"]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={area.scope === v}
            onClick={() => onChange({ ...area, scope: v })}
            className={cn("rounded-full border px-4 py-1.5 text-sm transition", area.scope === v ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {selected && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Field label="States">
              <Select
                value={pick}
                onChange={(e) => {
                  const code = e.target.value;
                  setPick("");
                  if (code && !area.states.includes(code)) onChange({ ...area, states: [...area.states, code] });
                }}
              >
                <option value="">Add a state…</option>
                {US_STATES.filter((s) => !area.states.includes(s.code)).map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected states">
              {area.states.map((code) => (
                <li key={code}>
                  <Badge tone="accent">
                    {nameOf(code)}
                    <button type="button" aria-label={`Remove ${nameOf(code)}`} className="ml-1 opacity-70 hover:opacity-100" onClick={() => onChange({ ...area, states: area.states.filter((c) => c !== code) })}>
                      ✕
                    </button>
                  </Badge>
                </li>
              ))}
              {area.states.length === 0 && <li className="text-xs text-muted">No state chosen yet.</li>}
            </ul>
          </div>

          <Field label="Cities or counties (optional)" hint="Comma separated, e.g. Houston, Liberty County. Leave blank to accept the whole state.">
            {/* uncontrolled + keyed: typing a comma never gets eaten; the list is committed on blur or Enter */}
            <Input
              key={area.places.join("|")}
              defaultValue={area.places.join(", ")}
              placeholder="Houston, Liberty County"
              onBlur={(e) => onChange({ ...area, places: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </Field>
        </div>
      )}

      <p className="text-xs text-muted">
        {selected
          ? "Contracts whose work is outside this area are rejected. Contracts that do not say where the work is stay unproven until you confirm it."
          : "No location filter. Every contract is considered, wherever the work is."}
      </p>
    </div>
  );
}
