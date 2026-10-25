import { analyzeAll, generateScripts, type ScriptSet } from "@/engine";
import { ENGINE_VERSION } from "@/engine/config";
import { adminGuard } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { AnalyzeRequestSchema, resolveToday } from "@/server/schemas";

/** Runs the engine on the admin's pipeline. Stateless: nothing is stored on the server. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, AnalyzeRequestSchema, 8_000_000);
  if ("error" in body) return body.error;

  const { settings, subcontractors, quotes, items, withScripts } = body.data;
  const today = resolveToday(body.data.today);
  const analyses = analyzeAll(items, { settings, subcontractors, quotes, today });

  let scripts: Record<string, ScriptSet> | undefined;
  if (withScripts) {
    scripts = {};
    for (const item of items) {
      const a = analyses.find((x) => x.opportunityId === item.opportunity.id);
      if (a) scripts[item.opportunity.id] = generateScripts(item.opportunity, a, item.inputs, settings, today);
    }
  }
  return ok({ asOf: today, engineVersion: ENGINE_VERSION, analyses, scripts });
}
