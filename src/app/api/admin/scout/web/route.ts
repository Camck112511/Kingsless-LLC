import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { ScoutWebRequestSchema, resolveToday } from "@/server/schemas";
import { runWebScout } from "@/server/sources/web-scout";

// Web search can take a minute or two.
export const maxDuration = 300;

/** AI web scout: searches the open web for open solicitations that fit the owner's business. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ScoutWebRequestSchema, 100_000);
  if ("error" in body) return body.error;
  const result = await runWebScout(body.data.settings, resolveToday(body.data.today), body.data.query, body.data.maxLeads);
  if ("error" in result) return fail(503, result.error);
  return ok(result);
}
