import "server-only";
/**
 * USAspending.gov (https://api.usaspending.gov): free, no key. Two uses:
 *   1. Past awards for similar work in your area: what the government has actually paid, and to whom. This anchors the
 *      expected market price and shows the incumbents.
 *   2. Subawards: the companies that prime contractors have already hired for similar work. These are real, working
 *      subcontractors, found by evidence rather than by a directory listing.
 * Federal data only. Subaward reporting is incomplete (only primes above reporting thresholds file them), so a short list
 * is not proof that nobody else does the work.
 *
 * NOTE: written from the public API contract (spending_by_award); the build environment could not reach the live API,
 * so parsing is defensive and every field is optional. Check the first live response and adjust field names if needed.
 *
 * PROTECTED. See AGENTS.project.md.
 */
const ENDPOINT = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

export class UsaSpendingError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "UsaSpendingError";
  }
}

export interface AwardQuery {
  keywords: string[];
  naics: string[];
  states: string[];
  /** How many years back to look. */
  yearsBack: number;
  limit: number;
}

export interface PastAward {
  awardId: string;
  recipient: string;
  amountUsd: number | null;
  startDate: string | null;
  endDate: string | null;
  agency: string;
  description: string;
  naics: string;
  place: string;
  url: string;
}

export interface SubAwardee {
  name: string;
  /** Number of subawards found, and what they added up to. */
  count: number;
  totalUsd: number;
  latest: string | null;
  states: string[];
  agencies: string[];
  examples: Array<{ description: string; amountUsd: number | null; date: string | null; prime: string }>;
  uei: string;
}

export interface MarketStats {
  count: number;
  medianUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const isoDay = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const obj = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});

function placeText(v: unknown): { text: string; state: string } {
  const o = obj(v);
  const city = str(o.city_name);
  const state = str(o.state_code) || str(o.state_name);
  return { text: [city, state].filter(Boolean).join(", "), state: state.toUpperCase().slice(0, 2) };
}

function filters(q: AwardQuery, now: Date): Record<string, unknown> {
  const start = new Date(now.getTime() - Math.max(1, q.yearsBack) * 365 * 86_400_000).toISOString().slice(0, 10);
  const f: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: start, end_date: now.toISOString().slice(0, 10) }],
  };
  if (q.keywords.length) f.keywords = q.keywords.slice(0, 5);
  if (q.naics.length) f.naics_codes = { require: q.naics.slice(0, 10) };
  if (q.states.length) f.place_of_performance_locations = q.states.slice(0, 10).map((state) => ({ country: "USA", state: state.toUpperCase() }));
  return f;
}

async function call(body: Record<string, unknown>): Promise<Row[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new UsaSpendingError("Could not reach USAspending.gov (network error or timeout).", 502);
  }
  if (res.status === 422 || res.status === 400) throw new UsaSpendingError("USAspending.gov did not accept that search. Try fewer words or a different code.", 400);
  if (res.status === 429) throw new UsaSpendingError("USAspending.gov is rate limiting requests. Try again in a minute.", 429);
  if (!res.ok) throw new UsaSpendingError(`USAspending.gov returned HTTP ${res.status}.`, 502);
  const json = (await res.json().catch(() => null)) as { results?: unknown } | null;
  return Array.isArray(json?.results) ? (json!.results as Row[]) : [];
}

export function parseAwards(rows: Row[]): PastAward[] {
  return rows.flatMap((r) => {
    const recipient = str(r["Recipient Name"]);
    if (!recipient) return [];
    const place = placeText(r["Primary Place of Performance"]);
    const internal = str(r.generated_internal_id);
    return [
      {
        awardId: str(r["Award ID"]),
        recipient,
        amountUsd: num(r["Award Amount"]),
        startDate: isoDay(r["Start Date"]),
        endDate: isoDay(r["End Date"]),
        agency: str(r["Awarding Sub Agency"]) || str(r["Awarding Agency"]),
        description: str(r.Description).slice(0, 400),
        naics: str(obj(r.NAICS).code) || str(r.NAICS),
        place: place.text,
        url: internal ? `https://www.usaspending.gov/award/${encodeURIComponent(internal)}` : "https://www.usaspending.gov/search",
      },
    ];
  });
}

export function marketStats(awards: PastAward[]): MarketStats {
  const amounts = awards.map((a) => a.amountUsd).filter((n): n is number => n !== null && n > 0).sort((a, b) => a - b);
  if (amounts.length === 0) return { count: 0, medianUsd: null, lowUsd: null, highUsd: null };
  // Linear interpolation between neighbouring ranks, the usual definition of a quartile.
  const at = (p: number) => {
    const pos = p * (amounts.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(amounts.length - 1, lo + 1);
    return amounts[lo]! + (amounts[hi]! - amounts[lo]!) * (pos - lo);
  };
  return { count: amounts.length, medianUsd: Math.round(at(0.5)), lowUsd: Math.round(at(0.25)), highUsd: Math.round(at(0.75)) };
}

export async function searchPastAwards(q: AwardQuery, now: Date = new Date()): Promise<{ awards: PastAward[]; stats: MarketStats }> {
  const rows = await call({
    filters: filters(q, now),
    fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date", "End Date", "Awarding Agency", "Awarding Sub Agency", "Description", "NAICS", "Primary Place of Performance", "generated_internal_id"],
    sort: "Award Amount",
    order: "desc",
    limit: Math.min(100, Math.max(1, q.limit)),
    page: 1,
    subawards: false,
  });
  const awards = parseAwards(rows);
  return { awards, stats: marketStats(awards) };
}

export function groupSubawards(rows: Row[]): SubAwardee[] {
  const byName = new Map<string, SubAwardee>();
  for (const r of rows) {
    const name = str(r["Sub-Awardee Name"]).trim();
    if (!name) continue;
    const key = name.toUpperCase();
    const amount = num(r["Sub-Award Amount"]);
    const date = isoDay(r["Sub-Award Date"]);
    const state = placeText(r["Sub-Recipient Location"]).state || placeText(r["Sub-Award Primary Place of Performance"]).state;
    const agency = str(r["Awarding Sub Agency"]) || str(r["Awarding Agency"]);
    const cur =
      byName.get(key) ?? { name, count: 0, totalUsd: 0, latest: null, states: [], agencies: [], examples: [], uei: str(r["Sub-Recipient UEI"]) };
    cur.count += 1;
    cur.totalUsd += amount ?? 0;
    if (date && (!cur.latest || date > cur.latest)) cur.latest = date;
    if (state && !cur.states.includes(state)) cur.states.push(state);
    if (agency && !cur.agencies.includes(agency)) cur.agencies.push(agency);
    if (cur.examples.length < 3) cur.examples.push({ description: str(r["Sub-Award Description"]).slice(0, 240), amountUsd: amount, date, prime: str(r["Prime Recipient Name"]) });
    byName.set(key, cur);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || b.totalUsd - a.totalUsd);
}

export async function searchSubawardees(q: AwardQuery, now: Date = new Date()): Promise<SubAwardee[]> {
  const rows = await call({
    filters: filters(q, now),
    fields: [
      "Sub-Awardee Name", "Sub-Award Amount", "Sub-Award Date", "Sub-Award Description", "Prime Recipient Name", "Prime Award ID",
      "Sub-Recipient Location", "Sub-Award Primary Place of Performance", "Sub-Recipient UEI", "Awarding Agency", "Awarding Sub Agency", "NAICS",
    ],
    sort: "Sub-Award Amount",
    order: "desc",
    limit: Math.min(100, Math.max(1, q.limit)),
    page: 1,
    subawards: true,
  });
  return groupSubawards(rows);
}
