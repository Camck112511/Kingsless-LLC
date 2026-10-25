import { scoreFit } from "@/engine/fit";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { ScoutFeedsRequestSchema, resolveToday } from "@/server/schemas";
import { readFeed } from "@/server/sources/feeds";
import { leadToOpportunity, safeHttpUrl, type ScoutItem, type ScoutResult } from "@/server/sources/leads";

export const maxDuration = 60;

/** Reads the bid feeds (RSS / Atom) the owner subscribed to. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ScoutFeedsRequestSchema, 100_000);
  if ("error" in body) return body.error;
  const { settings } = body.data;
  const today = resolveToday(body.data.today);
  const urls = (body.data.urls ?? settings.targeting.feeds).map(safeHttpUrl).filter((u): u is string => u !== null).slice(0, 10);
  if (urls.length === 0) return fail(400, "No valid feed addresses yet. Add full web addresses (https://…) under Settings > What work you want.");

  const reads = await Promise.all(urls.map((u) => readFeed(u)));
  const notes: string[] = reads.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`);
  const seen = new Set<string>();
  const items: ScoutItem[] = [];
  let dropped = 0;
  for (const read of reads) {
    for (const lead of read.leads) {
      if (lead.dueDate && lead.dueDate < today) {
        dropped++;
        continue;
      }
      const opportunity = leadToOpportunity(lead, "feed", today);
      if (seen.has(opportunity.id)) continue;
      seen.add(opportunity.id);
      items.push({ opportunity, fit: scoreFit(opportunity, settings, today), whyItFits: "", portal: lead.portal });
    }
  }
  items.sort((a, b) => b.fit.score - a.fit.score);
  const result: ScoutResult = { items: items.slice(0, 150), notes, dropped, searches: 0, model: null };
  return ok(result);
}
