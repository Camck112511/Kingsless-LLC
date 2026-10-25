import type { CashResult } from "@/engine/types";
import { fmtUsd } from "@/components/format";

/** Step chart of the running cash balance by day after award. Purely a drawing of the engine's timeline. */
export function CashChart({ cash }: { cash: CashResult }) {
  const W = 640;
  const H = 190;
  const pad = { l: 56, r: 12, t: 14, b: 26 };
  const days = cash.events.map((e) => e.day);
  const maxDay = Math.max(1, ...days);
  const balances = cash.events.map((e) => e.balanceUsd);
  const lo = Math.min(0, ...balances);
  const hi = Math.max(0, ...balances);
  const span = hi - lo || 1;
  const x = (d: number) => pad.l + (d / maxDay) * (W - pad.l - pad.r);
  const y = (b: number) => pad.t + ((hi - b) / span) * (H - pad.t - pad.b);

  let path = `M ${x(0)} ${y(0)}`;
  let prev = 0;
  for (const e of cash.events) {
    path += ` L ${x(e.day)} ${y(prev)} L ${x(e.day)} ${y(e.balanceUsd)}`;
    prev = e.balanceUsd;
  }
  path += ` L ${x(maxDay)} ${y(prev)}`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cash balance over time. Lowest point ${fmtUsd(-cash.peakCashRequiredUsd)} on day ${cash.lowestBalanceDay}.`} className="w-full">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />
        <text x={pad.l - 6} y={y(0) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
          $0
        </text>
        <text x={pad.l - 6} y={y(hi) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
          {fmtUsd(hi)}
        </text>
        {lo < 0 && (
          <text x={pad.l - 6} y={y(lo) + 4} textAnchor="end" fontSize="10" fill="var(--fail)">
            {fmtUsd(lo)}
          </text>
        )}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {cash.peakCashRequiredUsd > 0 && <circle cx={x(cash.lowestBalanceDay)} cy={y(lo)} r="4" fill="var(--fail)" />}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={x(maxDay * t)} y={H - 8} textAnchor={t === 1 ? "end" : t === 0 ? "start" : "middle"} fontSize="10" fill="var(--muted)">
            day {Math.round(maxDay * t)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">Below the line is money you must have in hand. Day 0 is the award.</figcaption>
    </figure>
  );
}
