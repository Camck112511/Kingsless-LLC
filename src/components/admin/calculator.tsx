"use client";
import { useEffect, useState } from "react";
import { fmtPct, fmtUsd } from "@/components/format";
import { Card, Field, Notice, PageHeader, Stat } from "@/components/ui";
import { calcPricingApi, type PricingResponse } from "@/lib/api";
import { NumberField } from "./fields";

export function Calculator() {
  const [value, setValue] = useState<number | null>(10_000);
  const [sub, setSub] = useState<number | null>(5_700);
  const [other, setOther] = useState<number | null>(500);
  const [res, setRes] = useState<PricingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await calcPricingApi(value ?? 0, sub ?? 0, other ?? 0);
      if (!live) return;
      if (r.ok) {
        setRes(r.data);
        setError(null);
      } else setError(r.error);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, sub, other]);

  const p = res?.pricing;
  return (
    <>
      <PageHeader title="Pricing calculator" subtitle="The engine's pricing math in isolation. The defaults are the illustrative $10,000 example." />
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Customer contract value"><NumberField prefix="$" value={value} onChange={setValue} /></Field>
          <Field label="Subcontractor price"><NumberField prefix="$" value={sub} onChange={setSub} /></Field>
          <Field label="Other estimated costs" hint="Bonds, insurance, taxes, financing, admin, warranty, overruns"><NumberField prefix="$" value={other} onChange={setOther} /></Field>
        </div>
      </Card>
      {error && <Notice tone="fail" className="mt-4">{error}</Notice>}
      {p && (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Gross spread" value={fmtUsd(p.grossSpreadUsd, true)} sub={`Gross margin ${fmtPct(p.grossMarginRate, 1)}`} />
          <Stat label="Profit before taxes" value={fmtUsd(p.profitBeforeTaxUsd, true)} tone={p.profitBeforeTaxUsd < 0 ? "fail" : undefined} />
          <Stat label="Net margin estimate" value={fmtPct(p.netMarginRate, 1)} sub="Profit ÷ price" />
          <Stat label="Subcontractor share" value={fmtPct(p.subShareRate, 1)} sub="Sub price ÷ price" />
        </div>
      )}
      {res && p && (
        <Card className="mt-5">
          <h2 className="mb-2 text-base font-semibold">Margin is not markup</h2>
          <p className="text-sm leading-relaxed text-muted">
            The same profit, two ways: a <strong className="text-ink">{fmtPct(p.netMarginRate, 1)} margin</strong> on the price is a <strong className="text-ink">{fmtPct(p.markupOnCostRate, 1)} markup</strong> on your costs.
            A 10% margin on $10,000 means $1,000 of profit before overhead and tax. It is not take-home income.
          </p>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Illustrative estimates only. Actual costs may include bonds, insurance, taxes, financing, administration, warranty obligations, and overruns. This calculator does not verify contract eligibility or payment terms.</p>
    </>
  );
}
