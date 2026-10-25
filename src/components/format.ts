/** Display formatting only. Never use these to compute money; all numbers come from the engine. */
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export const fmtUsd = (n: number | null | undefined, cents = false): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : (cents ? usd2 : usd0).format(n);

export const fmtPct = (rate: number | null | undefined, digits = 0): string =>
  rate === null || rate === undefined || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(digits)}%`;

export const fmtDays = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : `${n} d`);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Only plain http(s) links are ever rendered as links; anything else (javascript:, data:, empty) becomes null. */
export const safeUrl = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
