import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { AwardsRequestSchema } from "@/server/schemas";
import { searchPastAwards, searchSubawardees, UsaSpendingError } from "@/server/sources/usaspending";

export const maxDuration = 60;

/** Past federal awards (market prices, incumbents) or subawardees (real subcontractors) from USAspending.gov. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, AwardsRequestSchema, 20_000);
  if ("error" in body) return body.error;
  const { mode, ...q } = body.data;
  if (q.keywords.length === 0 && q.naics.length === 0) return fail(400, "Give at least one keyword or NAICS code to search for.");
  try {
    if (mode === "awards") return ok({ mode, ...(await searchPastAwards(q)) });
    return ok({ mode, subawardees: await searchSubawardees(q) });
  } catch (err) {
    if (err instanceof UsaSpendingError) return fail(err.status, err.message);
    return fail(500, "USAspending search failed.");
  }
}
