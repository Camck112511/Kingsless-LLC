import { researchSubs } from "@/server/ai/sub-research";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { SubResearchRequestSchema } from "@/server/schemas";

export const maxDuration = 300;

/** AI web research for subcontractors who could perform a given job. Leads only: nothing is verified. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, SubResearchRequestSchema, 100_000);
  if ("error" in body) return body.error;
  const result = await researchSubs(body.data.opportunity, body.data.settings, body.data.count, body.data.extra);
  if ("error" in result) return fail(503, result.error);
  return ok(result);
}
