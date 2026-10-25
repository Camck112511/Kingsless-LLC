import "server-only";
/**
 * SAM.gov "Get Opportunities" public API (https://open.gsa.gov/api/get-opportunities-public-api/).
 * Needs a free API key in SAM_GOV_API_KEY. Daily request limits apply to every key; the Discover button is deliberate
 * (one request per click) so it does not burn quota in the background.
 *
 * The key travels in the query string, so URLs are never logged or included in error messages.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { checkLocation } from "@/engine/locations";
import type { ServiceArea } from "@/engine/types";
import { normalizeAward, normalizeSolicitation, type SamRecord } from "./sam-normalize";
import type { DiscoveryResult } from "./types";

const ENDPOINT = "https://api.sam.gov/opportunities/v2/search";

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

const mdy = (d: Date): string => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

export interface SamQuery {
  daysBack: number;
  keyword?: string;
  ncode?: string;
  state?: string;
  limit: number;
  kind: "solicitations" | "awards";
}

export function buildSamUrl(q: SamQuery, apiKey: string, now: Date = new Date()): URL {
  const from = new Date(now.getTime() - q.daysBack * 86_400_000);
  const url = new URL(ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("postedFrom", mdy(from));
  url.searchParams.set("postedTo", mdy(now));
  url.searchParams.set("limit", String(q.limit));
  url.searchParams.set("offset", "0");
  // o = solicitation, k = combined synopsis/solicitation, p = presolicitation, a = award notice
  url.searchParams.set("ptype", q.kind === "awards" ? "a" : "o,k");
  if (q.keyword) url.searchParams.set("title", q.keyword);
  if (q.ncode) url.searchParams.set("ncode", q.ncode);
  if (q.state) url.searchParams.set("state", q.state.toUpperCase());
  return url;
}

export async function discoverFromSam(q: SamQuery, apiKey: string | undefined, today: string, area?: ServiceArea): Promise<DiscoveryResult> {
  if (!apiKey) throw new SourceError("SAM_GOV_API_KEY is not set. Add a free key from SAM.gov (profile > Public API Key) to the environment.", 503);

  // postedFrom and postedTo must fall in the same calendar year per the API; split would double the quota, so clamp instead.
  const now = new Date();
  const year = now.getUTCFullYear();
  const from = new Date(now.getTime() - q.daysBack * 86_400_000);
  const clamped: SamQuery = from.getUTCFullYear() === year ? q : { ...q, daysBack: Math.max(1, Math.floor((now.getTime() - Date.UTC(year, 0, 1)) / 86_400_000)) };
  const url = buildSamUrl(clamped, apiKey, now);

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000), headers: { Accept: "application/json" } });
  } catch {
    throw new SourceError("Could not reach SAM.gov (network error or timeout).", 502);
  }
  if (res.status === 401 || res.status === 403) throw new SourceError("SAM.gov rejected the API key. Check SAM_GOV_API_KEY.", 502);
  if (res.status === 429) throw new SourceError("SAM.gov rate limit reached for this key. Try again later (daily limits apply).", 429);
  if (!res.ok) throw new SourceError(`SAM.gov returned HTTP ${res.status}.`, 502);

  const body = (await res.json().catch(() => null)) as { totalRecords?: number; opportunitiesData?: SamRecord[] } | null;
  const records = body?.opportunitiesData ?? [];
  const opportunities = q.kind === "solicitations" ? records.flatMap((r) => normalizeSolicitation(r, today) ?? []) : [];
  const awards = q.kind === "awards" ? records.flatMap((r) => normalizeAward(r) ?? []) : [];
  const areaMatch = area ? Object.fromEntries(opportunities.map((o) => [o.id, checkLocation(o.location, area)])) : {};
  return {
    opportunities,
    areaMatch,
    awards,
    totalRecords: body?.totalRecords ?? records.length,
    note: clamped.daysBack !== q.daysBack ? "SAM.gov limits a search to one calendar year, so the window was shortened to January 1." : "",
  };
}
