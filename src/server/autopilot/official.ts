import "server-only";
/**
 * Reads the OFFICIAL solicitation for a bid the owner authorized: the listing page and up to a few linked PDFs. The text is
 * used to fill facts the engine could not prove (each rule-reader fact keeps the sentence it came from; each AI fact must
 * quote the text verbatim) and to find where bids are emailed. Nothing it cannot read is guessed.
 *
 * PROTECTED. See AGENTS.project.md.
 */
import { applyPatch, extractSubmissionEmail, extractTerms, mergeAiFacts } from "@/engine";
import { RULES } from "@/engine/config";
import type { Opportunity } from "@/engine/types";
import { extractWithAi } from "../ai-extract";
import { bodyToText } from "../net/html";
import { FetchError, safeFetch } from "../net/safe-fetch";
import { safeHttpUrl } from "../sources/leads";

export interface OfficialRead {
  ok: boolean;
  text: string;
  /** Fingerprint of the text, to notice when the agency changes the listing. */
  hash: string;
  error: string | null;
}

const MAX_TEXT = 250_000;

export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.replace(/\s+/g, " ").trim().slice(0, 120_000)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function readOfficial(opp: Opportunity, fetcher: typeof safeFetch = safeFetch): Promise<OfficialRead> {
  const url = safeHttpUrl(opp.sourceUrl);
  if (!url) return { ok: false, text: "", hash: "", error: "The bid has no official link to read." };
  try {
    const page = await fetcher(url, { maxBytes: 8_000_000, timeoutMs: 15_000 });
    const main = await bodyToText(page.body, page.contentType, page.finalUrl);
    let text = main.text;
    // Linked PDFs often hold the real terms. Read a few, each failure tolerated.
    const pdfs = [...main.links, ...opp.documents].filter((d) => /\.pdf(\?|#|$)/i.test(d.url)).map((d) => safeHttpUrl(d.url)).filter((u): u is string => u !== null);
    for (const doc of [...new Set(pdfs)].slice(0, RULES.autopilot.maxDocumentsToRead)) {
      if (text.length >= MAX_TEXT) break;
      try {
        const res = await fetcher(doc, { maxBytes: 8_000_000, timeoutMs: 20_000 });
        const t = (await bodyToText(res.body, res.contentType, res.finalUrl)).text;
        if (t.length > 40) text += `\n\n--- Document: ${doc} ---\n${t}`;
      } catch {
        /* an unreadable attachment must not stop the pass */
      }
    }
    text = text.slice(0, MAX_TEXT);
    if (text.length < 40) return { ok: false, text: "", hash: "", error: "The official page has almost no readable text (it may need JavaScript or a login)." };
    return { ok: true, text, hash: fingerprint(text), error: null };
  } catch (err) {
    return { ok: false, text: "", hash: "", error: err instanceof FetchError ? err.message : "Could not read the official page." };
  }
}

export interface Refined {
  opportunity: Opportunity;
  /** New facts learned from the text, as short phrases for the log. */
  learned: string[];
  discoveredEmail: string | null;
}

/** Fill facts that are still unknown from the official text. Known facts are never overwritten. */
export async function refineFromText(opp: Opportunity, text: string, aiEnabled: boolean, today: string): Promise<Refined> {
  const patch = extractTerms(text);
  let terms = applyPatch(opp.terms, patch);
  if (aiEnabled) {
    const ai = await extractWithAi(text.slice(0, 120_000));
    if (ai.used) terms = mergeAiFacts(terms, ai.facts, text).terms;
  }
  const learned: string[] = [];
  for (const k of Object.keys(terms) as Array<keyof typeof terms>) {
    if (k === "evidence" || k === "licensingNotes") continue;
    const before = opp.terms[k];
    const after = terms[k];
    const wasBlank = before === "unknown" || before === null;
    if (wasBlank && after !== before) learned.push(`${String(k)}: ${String(after)}`);
  }
  return {
    opportunity: { ...opp, terms, provenance: { ...opp.provenance, checkedOn: today } },
    learned,
    discoveredEmail: extractSubmissionEmail(text),
  };
}
