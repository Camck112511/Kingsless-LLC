import { scoreFit } from "@/engine/fit";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { ScoutSamRequestSchema, resolveToday } from "@/server/schemas";
import type { ScoutItem, ScoutResult } from "@/server/sources/leads";
import { discoverFromSam, SourceError } from "@/server/sources/sam";

/** SAM.gov solicitations, scored against the owner's business. One API request per call. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ScoutSamRequestSchema, 100_000);
  if ("error" in body) return body.error;
  const { settings, keyword, ncode, state, daysBack, limit } = body.data;
  const today = resolveToday(body.data.today);
  try {
    const found = await discoverFromSam({ daysBack, keyword, ncode, state, limit, kind: "solicitations" }, process.env.SAM_GOV_API_KEY, today, settings.serviceArea);
    const items: ScoutItem[] = found.opportunities
      .map((opportunity) => ({ opportunity, fit: scoreFit(opportunity, settings, today), whyItFits: "", portal: "SAM.gov" }))
      .sort((a, b) => b.fit.score - a.fit.score);
    const result: ScoutResult = { items, notes: found.note ? [found.note] : [], dropped: 0, searches: 1, model: null };
    return ok(result);
  } catch (err) {
    if (err instanceof SourceError) return fail(err.status, err.message);
    return fail(500, "SAM.gov search failed.");
  }
}
