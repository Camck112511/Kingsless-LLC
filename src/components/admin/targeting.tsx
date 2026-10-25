"use client";
import { Card, CardTitle, Field } from "@/components/ui";
import { actions } from "@/lib/store";
import type { ServiceCategory, Settings, Targeting } from "@/engine/types";
import { NumberField, TagField } from "./fields";

/** Common work types with their NAICS codes, so picking a trade fills in the right codes and words. */
const PRESETS: Array<{ label: string; naics: string[]; keywords: string[]; categories: ServiceCategory[] }> = [
  { label: "Site clearing & grading", naics: ["238910", "237310", "237990"], keywords: ["clearing", "grading", "earthwork", "site preparation"], categories: ["construction-general", "construction-specialty"] },
  { label: "Janitorial & cleaning", naics: ["561720"], keywords: ["janitorial", "custodial", "cleaning"], categories: ["facility-services"] },
  { label: "Landscaping & grounds", naics: ["561730"], keywords: ["landscaping", "mowing", "grounds maintenance"], categories: ["facility-services"] },
  { label: "Security guards", naics: ["561612"], keywords: ["security guard", "patrol", "security services"], categories: ["security-guard"] },
  { label: "Facilities maintenance", naics: ["561210", "561790"], keywords: ["facilities maintenance", "building maintenance", "repair"], categories: ["facility-services"] },
  { label: "Paving & concrete", naics: ["237310", "238110"], keywords: ["paving", "asphalt", "concrete", "sidewalk"], categories: ["construction-specialty"] },
  { label: "Supplies & equipment", naics: [], keywords: ["supplies", "equipment", "furniture", "materials"], categories: ["supply"] },
];

const CATEGORY_LABELS: Array<{ id: ServiceCategory; label: string }> = [
  { id: "supply", label: "Supplies" },
  { id: "construction-general", label: "General construction" },
  { id: "construction-specialty", label: "Specialty trades" },
  { id: "security-guard", label: "Security guards" },
  { id: "facility-services", label: "Facility services" },
  { id: "professional-services", label: "Professional services" },
  { id: "other-services", label: "Other services" },
];

const mergeUnique = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()))];

export function TargetingCard({ settings }: { settings: Settings }) {
  const t = settings.targeting;
  const set = (p: Partial<Targeting>) => actions.setSettings({ ...settings, targeting: { ...t, ...p } });
  return (
    <Card>
      <CardTitle>What work you want</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-muted">
        Tell the console what to chase. Every listing is scored against this, and the best matches are recommended first. It never overrides a rule: a perfect match that fails a hard rule is still rejected.
      </p>

      <div className="mb-4">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Quick start: add a trade</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => set({ naics: mergeUnique(t.naics, p.naics), keywords: mergeUnique(t.keywords, p.keywords), categories: [...new Set([...t.categories, ...p.categories])] })}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium transition hover:bg-surface-2"
            >
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Words for work you want" hint="Press Enter after each. Matches the title and scope.">
          <TagField aria-label="Words for work you want" value={t.keywords} onChange={(keywords) => set({ keywords })} placeholder="e.g. grading, janitorial" />
        </Field>
        <Field label="NAICS codes" hint="2 to 6 digits. A short code matches everything under it.">
          <TagField aria-label="NAICS codes" value={t.naics} onChange={(naics) => set({ naics })} normalize={(s) => (/^\d{2,6}$/.test(s.trim()) ? s.trim() : "")} placeholder="e.g. 238910" />
        </Field>
        <Field label="Words for work you never want" hint="A match makes the listing “not recommended”.">
          <TagField aria-label="Words for work you never want" value={t.avoidKeywords} onChange={(avoidKeywords) => set({ avoidKeywords })} placeholder="e.g. hazardous, asbestos" />
        </Field>
        <div className="text-sm">
          <span className="mb-1 block font-medium">Categories</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {CATEGORY_LABELS.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={t.categories.includes(c.id)}
                  onChange={(e) => set({ categories: e.target.checked ? [...t.categories, c.id] : t.categories.filter((x) => x !== c.id) })}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Smallest contract" hint="Blank = no minimum"><NumberField prefix="$" value={t.minValueUsd} onChange={(v) => set({ minValueUsd: v })} /></Field>
        <Field label="Largest contract" hint="Blank = no maximum"><NumberField prefix="$" value={t.maxValueUsd} onChange={(v) => set({ maxValueUsd: v })} /></Field>
        <Field label="Prefer due within (days)" hint="Blank = no preference"><NumberField value={t.maxDaysUntilDue} onChange={(v) => set({ maxDaysUntilDue: v === null ? null : Math.floor(v) })} /></Field>
        <Field label="Longest job you will take (days)" hint="Blank = no limit"><NumberField value={t.maxDurationDays} onChange={(v) => set({ maxDurationDays: v === null ? null : Math.floor(v) })} /></Field>
      </div>

      <div className="mt-4">
        <Field label="Bid feeds to watch (RSS / Atom, one per line)" hint="Many city, county and state portals publish a feed of new bids. Paste the feed address; the Scout reads it.">
          <textarea
            aria-label="Bid feeds"
            className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
            placeholder="https://example.gov/bids/rss.xml"
            value={t.feeds.join("\n")}
            onChange={(e) => set({ feeds: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
          />
        </Field>
      </div>
    </Card>
  );
}

