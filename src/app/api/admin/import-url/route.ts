import { adminGuard } from "@/server/auth";
import { fail, ok, readJson } from "@/server/http";
import { ImportUrlRequestSchema } from "@/server/schemas";
import { dueDateFromText } from "@/server/sources/feeds";
import { bodyToText } from "@/server/net/html";
import { FetchError, safeFetch } from "@/server/net/safe-fetch";

export const maxDuration = 60;
const MAX_TEXT = 300_000;

/** Reads a solicitation page or PDF from a link the owner pasted, so its text can be analyzed. PROTECTED. */
export async function POST(request: Request) {
  const denied = await adminGuard(request);
  if (denied) return denied;
  const body = await readJson(request, ImportUrlRequestSchema, 5_000);
  if ("error" in body) return body.error;
  try {
    const page = await safeFetch(body.data.url, { maxBytes: 8_000_000 });
    const { title, text, links } = await bodyToText(page.body, page.contentType, page.finalUrl);
    if (text.length < 40) return fail(422, "That page has almost no readable text (it may load its content with JavaScript). Open it in your browser and paste the text instead.");
    const blob = `${title}. ${text.slice(0, 20_000)}`;
    return ok({
      finalUrl: page.finalUrl,
      contentType: page.contentType,
      title,
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
      links,
      hints: {
        dueDate: dueDateFromText(blob),
        solicitationNumber: /\b(?:RFP|RFQ|IFB|ITB|RFB|Solicitation|Bid)\s*(?:No\.?|#|Number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-./]{2,30})/i.exec(blob)?.[1] ?? "",
        naics: /\bNAICS\s*(?:code)?\s*[:#]?\s*(\d{6})\b/i.exec(blob)?.[1] ?? "",
      },
    });
  } catch (err) {
    if (err instanceof FetchError) return fail(err.status, err.message);
    return fail(500, "Could not read that link.");
  }
}
