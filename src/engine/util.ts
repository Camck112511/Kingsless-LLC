/** Small pure helpers shared by the engine. PROTECTED engine file. */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Whole-day difference `to - from` for ISO dates/datetimes. Uses the calendar date in UTC so DST never shifts it. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export const isIsoDate = (s: string | null | undefined): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s.slice(0, 10)));

export const usd = (n: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const pct = (rate: number, digits = 0): string => `${(rate * 100).toFixed(digits)}%`;

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
