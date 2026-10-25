import { analyze } from "@/engine/analyze";
import { runReview } from "@/server/ai/review";
import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { bodyToText } from "@/server/net/html";
import { safeFetch } from "@/server/net/safe-fetch";
import { ReviewRequestSchema, resolveToday } from "@/server/schemas";
import { safeHttpUrl } from "@/server/sources/leads";

export const maxDuration = 300;

/** AI second opinion on one bid. Advisory only: the engine's verdict is never changed by it. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ReviewRequestSchema, 2_000_000);
  if ("error" in body) return body.error;
  const { settings, subcontractors, quotes, item, text, readSourcePage, research } = body.data;
  const today = resolveToday(body.data.today);
  const analysis = analyze(item, { settings, subcontractors, quotes, today });

  let pageText = "";
  const url = safeHttpUrl(item.opportunity.sourceUrl);
  if (readSourcePage && url) {
    try {
      const page = await safeFetch(url, { maxBytes: 8_000_000, timeoutMs: 12_000 });
      pageText = (await bodyToText(page.body, page.contentType, page.finalUrl)).text;
    } catch {
      pageText = ""; // many portals refuse automated reads; the review still runs on what is known
    }
  }
  const documentText = [text.trim(), pageText].filter(Boolean).join("\n\n---\n\n");
  const result = await runReview(item.opportunity, analysis, settings, documentText, {
    research,
    sourcePageChars: pageText.length,
    pastedChars: text.trim().length,
    now: today,
  });
  if ("error" in result) return fail(503, result.error);
  return ok(result);
}
