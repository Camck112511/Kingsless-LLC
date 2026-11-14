import "server-only";
/**
 * After a bid goes in, look for the result. Two sources, both honest about what they know:
 *   - SAM.gov award notices (federal): an award record names the winner, so a name match is a recorded win and any other
 *     name is a recorded loss.
 *   - The official page: if it now names the company near award words, that is only a SIGNAL for the owner to confirm.
 * Everything else is "no result yet". Nothing is ever assumed.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { sameCompany } from "@/engine";
import type { Opportunity } from "@/engine/types";
import { normalizeAward, type SamRecord } from "../sources/sam-normalize";

export type AwardCheck = { status: "won" | "lost" | "signal" | "none" | "error"; detail: string };

const AWARD_WORDS = /\b(award(?:ed)?|intent to award|notice of award|selected|successful (?:bidder|proposer|offeror)|apparent (?:low|successful)|recommended for award)\b/i;

/** Does the official page text name the company close to an award word? */
export function pageSignal(text: string, company: string): boolean {
  const name = company.trim();
  if (name.length < 3) return false;
  const core = name.replace(/\b(llc|l\.l\.c|inc|corp|corporation|co|company|ltd)\b\.?/gi, "").replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (core.length < 3) return false;
  const re = new RegExp(core.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\W+"), "ig");
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (AWARD_WORDS.test(text.slice(Math.max(0, at - 250), at + 250))) return true;
  }
  return false;
}

const mdy = (d: Date): string => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

export async function samAwardCheck(opp: Opportunity, company: string, apiKey: string | undefined, now: Date, fetchImpl: typeof fetch = fetch): Promise<AwardCheck> {
  const isFederal = opp.source === "sam.gov" || opp.level === "federal";
  if (!isFederal || !apiKey || !opp.solicitationNumber.trim()) return { status: "none", detail: "" };
  // The API only accepts a window inside one calendar year.
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const url = new URL("https://api.sam.gov/opportunities/v2/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("postedFrom", mdy(from));
  url.searchParams.set("postedTo", mdy(now));
  url.searchParams.set("ptype", "a");
  url.searchParams.set("solnum", opp.solicitationNumber.trim());
  url.searchParams.set("limit", "20");
  url.searchParams.set("offset", "0");
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(25_000), headers: { Accept: "application/json" } });
  } catch {
    return { status: "error", detail: "Could not reach SAM.gov to look for an award notice." };
  }
  if (!res.ok) return { status: "error", detail: `SAM.gov returned HTTP ${res.status} when looking for an award notice.` };
  const body = (await res.json().catch(() => null)) as { opportunitiesData?: SamRecord[] } | null;
  const awards = (body?.opportunitiesData ?? []).flatMap((r) => normalizeAward(r) ?? []);
  if (awards.length === 0) return { status: "none", detail: "" };
  const ours = awards.find((a) => sameCompany(a.awardee, company));
  if (ours) return { status: "won", detail: `SAM.gov award notice names ${ours.awardee}${ours.amountUsd ? ` ($${Math.round(ours.amountUsd).toLocaleString("en-US")})` : ""}.` };
  return { status: "lost", detail: `SAM.gov award notice names ${awards[0]!.awardee}.` };
}
