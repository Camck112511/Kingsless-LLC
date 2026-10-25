"use client";
import type { Analysis, CostItems, Inputs, SubTermsKind } from "@/engine/types";
import { fmtPct, fmtUsd } from "@/components/format";
import { Badge, Card, CardTitle, Field, Notice, Select } from "@/components/ui";
import { actions, type PipelineItem } from "@/lib/store";
import { NumberField } from "../fields";
import { CashChart } from "./cash-chart";

const COST_LABELS: Array<[keyof CostItems, string]> = [
  ["bondPremiumUsd", "Bond premium"],
  ["insurancePremiumUsd", "Insurance premium"],
  ["registrationUsd", "Registrations / licenses"],
  ["adminUsd", "Admin / bid costs"],
  ["financingUsd", "Financing"],
  ["otherUsd", "Other"],
];

const SUB_TERMS: Array<[SubTermsKind | "unknown", string]> = [
  ["unknown", "Unknown (assume cautiously)"],
  ["pay-when-paid", "Pay-when-paid (no deposit)"],
  ["net", "Net days after their invoice"],
  ["deposit-balance", "Deposit, balance at completion"],
  ["on-completion", "All at completion"],
];

export function EconomicsPanel({ item, analysis }: { item: PipelineItem; analysis: Analysis | undefined }) {
  const id = item.opportunity.id;
  const inputs = item.inputs;
  const set = (patch: Partial<Inputs>) => actions.updateItem(id, { inputs: { ...inputs, ...patch } });
  const setCost = (k: keyof CostItems, v: number | null) => set({ costs: { ...inputs.costs, [k]: v ?? 0 } });
  const terms = inputs.subTerms;

  const basis = analysis?.subPriceBasis ?? "none";
  const p = analysis?.pricing;

  return (
    <Card>
      <CardTitle
        aside={<Badge tone={basis === "firm-quote" ? "pass" : basis === "estimate" ? "unknown" : "neutral"}>{basis === "firm-quote" ? "Firm quote" : basis === "estimate" ? "Your estimate" : "No sub price yet"}</Badge>}
      >
        Economics
      </CardTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected customer price" hint="Government estimate or what you expect it to pay">
              <NumberField prefix="$" value={inputs.marketPriceUsd} onChange={(v) => set({ marketPriceUsd: v })} />
            </Field>
            <Field label="Your planned bid" hint="Blank = use the expected price">
              <NumberField prefix="$" value={inputs.plannedBidUsd} onChange={(v) => set({ plannedBidUsd: v })} />
            </Field>
            <Field label="Sub price estimate" hint="Replaced by a firm quote once entered">
              <NumberField prefix="$" value={inputs.subPriceEstimateUsd} onChange={(v) => set({ subPriceEstimateUsd: v })} />
            </Field>
            <Field label="Mobilizes after award" hint="Days">
              <NumberField value={inputs.startLeadDays} onChange={(v) => set({ startLeadDays: v ?? 0 })} />
            </Field>
            <Field label="Duration override" hint={`Days. Listing: ${item.opportunity.durationDays ?? "not stated"}`}>
              <NumberField value={inputs.durationDays} onChange={(v) => set({ durationDays: v })} />
            </Field>
          </div>

          <div>
            <Field label="Subcontractor payment terms" hint="From their quote. Pay-when-paid is the only structure that needs no working capital.">
              <Select
                value={terms?.kind ?? "unknown"}
                onChange={(e) => {
                  const kind = e.target.value as SubTermsKind | "unknown";
                  set({ subTerms: kind === "unknown" ? null : { kind, depositRate: terms?.depositRate ?? (kind === "deposit-balance" ? 0.3 : 0), netDays: terms?.netDays ?? (kind === "net" ? 30 : 0) } });
                }}
              >
                {SUB_TERMS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {terms && (terms.kind === "deposit-balance" || terms.kind === "net" || terms.kind === "on-completion") && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                {terms.kind === "deposit-balance" && (
                  <Field label="Deposit">
                    <NumberField mode="rate" suffix="%" value={terms.depositRate} onChange={(v) => set({ subTerms: { ...terms, depositRate: Math.min(1, v ?? 0) } })} />
                  </Field>
                )}
                <Field label="Net days">
                  <NumberField value={terms.netDays} onChange={(v) => set({ subTerms: { ...terms, netDays: v ?? 0 } })} />
                </Field>
              </div>
            )}
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">Cash costs paid at award</legend>
            <div className="grid grid-cols-2 gap-3">
              {COST_LABELS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <NumberField prefix="$" value={inputs.costs[k]} onChange={(v) => setCost(k, v)} />
                </Field>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-4">
          {analysis ? (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Three prices</h3>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Target bid", analysis.prices.targetBidUsd, "Meets your margin; stays at or under the market"],
                    ["Max sub price", analysis.prices.maxSubPriceUsd, "Most you can pay the sub"],
                    ["Walk-away", analysis.prices.walkAwayPriceUsd, "Lowest bid worth submitting"],
                  ].map(([label, value, hint]) => (
                    <div key={String(label)} className="rounded-xl bg-surface-2 p-3">
                      <dt className="text-xs font-medium text-muted">{label}</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums">{fmtUsd(value as number | null)}</dd>
                      <p className="mt-1 text-[11px] leading-tight text-muted">{hint}</p>
                    </div>
                  ))}
                </dl>
                {analysis.prices.notes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {analysis.prices.notes.map((n, i) => (
                      <li key={i}>• {n}</li>
                    ))}
                  </ul>
                )}
              </div>

              {p ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">At the working price ({fmtUsd(p.contractValueUsd)})</h3>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {[
                      ["Subcontractor", fmtUsd(p.subPriceUsd, true)],
                      ["Other costs + cushion", fmtUsd(p.otherCostsUsd, true)],
                      ["Gross spread", fmtUsd(p.grossSpreadUsd, true)],
                      ["Profit before tax", fmtUsd(p.profitBeforeTaxUsd, true)],
                      ["Net margin", fmtPct(p.netMarginRate, 1)],
                      ["Subcontractor share", fmtPct(p.subShareRate, 1)],
                      ["Markup on cost", fmtPct(p.markupOnCostRate, 1)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-line/60 py-1">
                        <dt className="text-muted">{k}</dt>
                        <dd className="font-medium tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-muted">Margin is profit ÷ price. Markup is profit ÷ cost. Before tax; excludes overhead you have not entered.</p>
                </div>
              ) : (
                <Notice tone="unknown">Enter an expected price and a sub-price estimate to see the economics. Nothing is assumed.</Notice>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">Scenarios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted">
                      <tr>
                        <th className="py-1 text-left font-medium"> </th>
                        <th className="py-1 text-right font-medium">Sub price</th>
                        <th className="py-1 text-right font-medium">Profit</th>
                        <th className="py-1 text-right font-medium">Margin</th>
                        <th className="py-1 text-right font-medium">Cash first</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.scenarios.map((s) => (
                        <tr key={s.name} className="border-t border-line/60">
                          <td className="py-1.5 capitalize">{s.name}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmtUsd(s.subPriceUsd)}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.pricing ? fmtUsd(s.pricing.profitBeforeTaxUsd) : "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.pricing ? fmtPct(s.pricing.netMarginRate, 1) : "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.cash ? fmtUsd(s.cash.peakCashRequiredUsd) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-muted">A quote or a stated clause makes all three agree. Gaps between them are what is still unproven.</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Calculating…</p>
          )}
        </div>
      </div>

      {analysis?.cash && (
        <div className="mt-6 grid gap-6 border-t border-line pt-5 lg:grid-cols-[1fr_auto]">
          <CashChart cash={analysis.cash} />
          <dl className="grid grid-cols-3 gap-4 text-center lg:w-72 lg:grid-cols-1 lg:text-left">
            <div>
              <dt className="text-xs text-muted">Cash needed before paid</dt>
              <dd className="text-xl font-semibold tabular-nums">{fmtUsd(analysis.cash.peakCashRequiredUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">First payment</dt>
              <dd className="text-xl font-semibold tabular-nums">day {analysis.cash.daysToFirstPayment}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Fully paid</dt>
              <dd className="text-xl font-semibold tabular-nums">day {analysis.cash.daysToFullPayment}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
