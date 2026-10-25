import { applyPatch, EMPTY_TERMS, extractTerms, mergeAiFacts } from "@/engine";
import { extractWithAi } from "@/server/ai-extract";
import { adminGuard } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { ExtractRequestSchema } from "@/server/schemas";

/** Reads pasted solicitation text into structured terms. Rule reader always runs; AI reader is optional. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ExtractRequestSchema, 1_000_000);
  if ("error" in body) return body.error;
  const { text, useAi, baseTerms } = body.data;

  const patch = extractTerms(text);
  const foundByRules = Object.keys(patch).filter((k) => k !== "evidence");
  let terms = applyPatch(baseTerms ?? EMPTY_TERMS, patch);

  let ai: { requested: boolean; used: boolean; model: string | null; error: string | null; accepted: unknown[]; rejected: unknown[]; conflicts: string[] } = {
    requested: useAi,
    used: false,
    model: null,
    error: null,
    accepted: [],
    rejected: [],
    conflicts: [],
  };
  if (useAi) {
    const result = await extractWithAi(text);
    const merged = mergeAiFacts(terms, result.facts, text);
    terms = merged.terms;
    ai = { requested: true, used: result.used, model: result.model, error: result.error, accepted: merged.accepted, rejected: merged.rejected, conflicts: merged.conflicts };
  }
  return ok({ terms, foundByRules, ai });
}
